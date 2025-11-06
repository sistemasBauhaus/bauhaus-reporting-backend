import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { pool } from "../db/connection";

dotenv.config();

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

let estacionesCache: Record<number, string> = {};
let cajasCache: Record<number, string> = {};
let preciosArticulos: Record<number, number> = {};

// ==========================================================
// 🔹 Utilidades
// ==========================================================

// Cargar estaciones
async function cargarEstaciones() {
  const res = await fetch(`${BASE_URL}/Estaciones/GetAllEstaciones`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const xml = await res.text();
  const json = await parseStringPromise(xml, { explicitArray: false });
  const estacionesRaw = json?.ArrayOfEstacion?.Estacion;
  const estaciones: any[] = Array.isArray(estacionesRaw)
    ? estacionesRaw
    : estacionesRaw
    ? [estacionesRaw]
    : [];
  estacionesCache = Object.fromEntries(
    estaciones.map((e: any) => [Number(e.IdEstacion), e.Nombre || "Sin nombre"])
  );
  console.log("✅ Estaciones cargadas:", estacionesCache);
}

// Cargar cajas
async function cargarCajas() {
  const res = await fetch(`${BASE_URL}/Cajas/GetAllCajas`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const xml = await res.text();
  const json = await parseStringPromise(xml, { explicitArray: false });
  const cajasRaw = json?.ArrayOfCaja?.Caja;
  const cajas: any[] = Array.isArray(cajasRaw)
    ? cajasRaw
    : cajasRaw
    ? [cajasRaw]
    : [];
  cajasCache = Object.fromEntries(
    cajas.map((c: any) => [Number(c.IdCaja), c.Descripcion || c.NombreCaja || "Caja sin nombre"])
  );
  console.log("✅ Cajas cargadas:", cajasCache);
}

// ==========================================================
// 🔹 Cargar precios desde la base local (tabla precios_articulos)
// ===========================================================

async function cargarPreciosArticulos() {
  try {
    console.log("📊 Intentando leer precios desde public.precios_articulos...");
    const { rows } = await pool.query(`
      SELECT producto_id::int, precio::numeric
      FROM public.precios_articulos
      ORDER BY producto_id
    `);

    console.log(`📈 Consulta SQL devuelta: ${rows.length} filas`);
    if (rows.length === 0) {
      console.warn("⚠️ No se encontraron precios en la base local (tabla vacía o schema incorrecto)");
    }

    const mapa: Record<number, number> = {};
    for (const r of rows) {
      const id = Number(r.producto_id);
      const p = Number(r.precio);
      if (!isNaN(id) && !isNaN(p)) mapa[id] = p;
    }

    preciosArticulos = mapa;
    console.log("✅ Precios cargados correctamente:", preciosArticulos);
  } catch (e: any) {
    console.error("❌ Error leyendo precios_articulos:", e.message);
  }
}

// ==========================================================
// 🔹 Generar rango de fechas
// ==========================================================
function generarFechas(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  let actual = new Date(desde);
  const fin = new Date(hasta);
  while (actual <= fin) {
    const fechaStr = actual.toISOString().split("T")[0];
    if (typeof fechaStr === "string") {
      fechas.push(fechaStr);
    }
    actual.setDate(actual.getDate() + 1);
  }
  return fechas;
}

// ==========================================================
// 🔹 Función principal
// ==========================================================
export const syncCierresToDB = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    if (typeof fechaInicio !== "string" || typeof fechaFin !== "string") {
      res.status(400).json({ error: "Debes enviar fechaInicio y fechaFin (YYYY-MM-DD)" });
      return;
    }

    if (Object.keys(estacionesCache).length === 0) await cargarEstaciones();
    if (Object.keys(cajasCache).length === 0) await cargarCajas();
    if (Object.keys(preciosArticulos).length === 0) await cargarPreciosArticulos();

    const idEstacion = 1;
    const nombreEstacion = estacionesCache[idEstacion] || "Desconocida";
    const fechas = generarFechas(fechaInicio, fechaFin);
    let totalCierres = 0;

    console.log(`📆 Procesando desde ${fechaInicio} hasta ${fechaFin} (${fechas.length} días)`);

    let avance = 0;
    const totalFechas = fechas.length;
    const totalCajas = Object.keys(cajasCache).length;
    for (const [iFecha, fecha] of fechas.entries()) {
      for (const [iCaja, [idCajaStr, nombreCaja]] of Object.entries(cajasCache).entries()) {
        const idCaja = Number(idCajaStr);
        if (/NO USAR|ADMINISTRATIVA/i.test(nombreCaja)) continue;

        avance++;
        console.log(`� Procesando: Fecha ${fecha} (${iFecha + 1}/${totalFechas}), Caja ${nombreCaja} (ID ${idCaja}) (${iCaja + 1}/${totalCajas}), avance: ${avance}`);

        const urlCierres = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
        const resp = await fetch(urlCierres, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const xml = await resp.text();
        if (!xml || xml.startsWith("<!DOCTYPE")) continue;

        const json = await parseStringPromise(xml, { explicitArray: false });
        const cierres = json?.ArrayOfCierreTurno?.CierreTurno;
        if (!cierres) continue;

        const listaCierres = Array.isArray(cierres) ? cierres : [cierres];

        for (const cierre of listaCierres) {
          const idCierreTurno = Number(cierre.IdCierreTurno);
          const fechaHora = cierre.Fecha;
          const diffHoras = (Date.now() - new Date(fechaHora).getTime()) / 3600000;
          if (diffHoras < 1) continue;

          const urlDetalle = `${BASE_URL}/Cierres/GetInformacionCierreTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fechaHoraCierre=${fechaHora}`;
          const detalleResp = await fetch(urlDetalle, { headers: { Authorization: `Bearer ${TOKEN}` } });
          const xmlDetalle = await detalleResp.text();

          // 👇 Log para ver el XML recibido
          console.log("🔎 XML recibido de GetInformacionCierreTurno:", xmlDetalle);

          // Si quieres ver el JSON parseado:
          const jsonDetalle = await parseStringPromise(xmlDetalle, { explicitArray: false });
          console.log("🔎 JSON parseado:", JSON.stringify(jsonDetalle, null, 2));

          if (!xmlDetalle || xmlDetalle.startsWith("<!DOCTYPE")) continue;

          const info = jsonDetalle?.InformacionCierreTurno || {};
          const totalImporte = Number(info?.ImporteVentasTotalesContado || 0);
          const totalLitros = Number(info?.TotalLitrosDespachados || 0);
          const totalEfectivoRecaudado = Number(info?.TotalEfectivoRecaudado || 0);
          const importeVentasTotalesContado = Number(info?.ImporteVentasTotalesContado || 0);

          console.log('➡️ Valores a guardar en cierres_turno:', {
            idCierreTurno,
            fechaHora,
            idCaja,
            nombreCaja,
            idEstacion,
            nombreEstacion,
            totalImporte,
            totalLitros,
            totalEfectivoRecaudado,
            importeVentasTotalesContado
          });

          await pool.query(
            `INSERT INTO cierres_turno (
              id_cierre_turno, fecha, id_caja, nombre_caja,
              id_estacion, nombre_estacion, importe_total, litros_total,
              total_efectivo_recaudado, importe_ventas_totales_contado
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (id_cierre_turno)
            DO UPDATE SET
              total_efectivo_recaudado = EXCLUDED.total_efectivo_recaudado,
              importe_ventas_totales_contado = EXCLUDED.importe_ventas_totales_contado,
              importe_total = EXCLUDED.importe_total,
              litros_total = EXCLUDED.litros_total,
              nombre_caja = EXCLUDED.nombre_caja,
              nombre_estacion = EXCLUDED.nombre_estacion,
              id_caja = EXCLUDED.id_caja,
              id_estacion = EXCLUDED.id_estacion,
              fecha = EXCLUDED.fecha
            ;`,
            [idCierreTurno, fechaHora, idCaja, nombreCaja, idEstacion, nombreEstacion, totalImporte, totalLitros, totalEfectivoRecaudado, importeVentasTotalesContado]
          );

          const articulos = info?.ArticulosDespachados?.InformacionCierreTurnoDetalle;
          const listaArt = Array.isArray(articulos) ? articulos : articulos ? [articulos] : [];

          if (listaArt.length > 0) {
            for (const art of listaArt) {
              const productoId = Number(art?.Articulo?.IdArticulo || 0);
              const nombreProd = art?.Articulo?.Descripcion?.trim() || "Sin nombre";
              const litros = Number(art?.LitrosDespachados || 0);
              let importe = Number(art?.ImporteTotal || 0);

              if (importe === 0 && preciosArticulos[productoId]) {
                importe = litros * preciosArticulos[productoId];
              }

              await pool.query(
                `INSERT INTO dim_producto (producto_id, nombre, origen, categoria)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (producto_id) DO NOTHING`,
                [productoId, nombreProd, "Playa", "COMBUSTIBLES"]
              );

              await pool.query(
                `INSERT INTO datos_metricas (
                  fecha, empresa_id, depto_id, producto_id, cantidad, importe,
                  estacion_id, caja_id, nombre_estacion, nombre_caja, id_cierre_turno
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                ON CONFLICT (id_cierre_turno, producto_id)
                DO UPDATE SET cantidad = EXCLUDED.cantidad, importe = EXCLUDED.importe`,
                [
                  fechaHora,
                  1,
                  1,
                  productoId,
                  litros,
                  importe,
                  idEstacion,
                  idCaja,
                  nombreEstacion,
                  nombreCaja,
                  idCierreTurno,
                ]
              );
            }
          } else if (/SHOP/i.test(nombreCaja)) {
            await pool.query(
              `INSERT INTO dim_producto (producto_id, nombre, origen, categoria)
              VALUES (8, 'Golosinas/Bebidas', 'Shop', 'SHOP')
              ON CONFLICT (producto_id) DO NOTHING`
            );

            await pool.query(
              `INSERT INTO datos_metricas (
                fecha, empresa_id, depto_id, producto_id, cantidad, importe,
                estacion_id, caja_id, nombre_estacion, nombre_caja, id_cierre_turno
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
              ON CONFLICT (id_cierre_turno, producto_id)
              DO UPDATE SET importe = EXCLUDED.importe`,
              [fechaHora, 1, 4, 8, 0, totalImporte, idEstacion, idCaja, nombreEstacion, nombreCaja, idCierreTurno]
            );
          }

          totalCierres++;
        }
      }
    }

    res.status(200).json({ ok: true, message: "✅ Sincronización completada correctamente", totalCierres });
  } catch (error) {
    console.error("❌ Error en syncCierresToDB:", (error as Error).message);
    res.status(500).json({ error: "Error al sincronizar cierres" });
  }
};
