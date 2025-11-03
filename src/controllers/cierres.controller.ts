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

// 🔹 Cargar estaciones desde la API
async function cargarEstaciones() {
  const res = await fetch(`${BASE_URL}/Estaciones/GetAllEstaciones`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const xml = await res.text();

  if (xml.trim().startsWith("<!DOCTYPE") || xml.trim().startsWith("<html")) {
    console.error("❌ Error: token vencido o sin autorización al cargar estaciones");
    return;
  }

  const json = await parseStringPromise(xml, { explicitArray: false });
  const estaciones = json?.ArrayOfEstacion?.Estacion || json?.Estaciones?.Estacion || [];
  const estacionesArr = Array.isArray(estaciones) ? estaciones : [estaciones];

  estacionesCache = Object.fromEntries(
    estacionesArr.map((e: any) => [Number(e.IdEstacion), e.Nombre || e.Descripcion || "Sin nombre"])
  );

  console.log("✅ Estaciones cargadas:", estacionesCache);
}

// 🔹 Cargar cajas desde la API
async function cargarCajas() {
  const res = await fetch(`${BASE_URL}/Cajas/GetAllCajas`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const xml = await res.text();
  const data = await parseStringPromise(xml, { explicitArray: false });

  let cajasArr: any[] = [];
  if (data.ArrayOfCaja?.Caja) {
    cajasArr = Array.isArray(data.ArrayOfCaja.Caja)
      ? data.ArrayOfCaja.Caja
      : [data.ArrayOfCaja.Caja];
  }

  cajasCache = Object.fromEntries(
    cajasArr.map((c: any) => [
      Number(c.IdCaja),
      c.Descripcion || c.NombreCaja || "Caja sin nombre",
    ])
  );

  console.log("✅ Cajas cargadas:", cajasCache);
}

// 🔹 Generar rango de fechas
function generarFechas(fechaInicio: string, fechaFin: string): string[] {
  const fechas: string[] = [];
  const inicio = new Date(fechaInicio ?? "");
  const fin = new Date(fechaFin ?? "");

  while (inicio <= fin) {
    // Asegura que inicio siempre sea un Date válido
    const fechaStr = isNaN(inicio.getTime()) ? undefined : inicio.toISOString().split("T")[0];
    if (typeof fechaStr === 'string' && fechaStr.length > 0) {
      fechas.push(fechaStr);
    }
    inicio.setDate(inicio.getDate() + 1);
  }

  return fechas;
}

// ✅ 1. Sincronización manual
export const syncCierresToDB = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    if (typeof fechaInicio !== "string" || typeof fechaFin !== "string" || !fechaInicio || !fechaFin) {
      res.status(400).json({ error: "Debes enviar fechaInicio y fechaFin como strings en el query" });
      return;
    }

    if (Object.keys(estacionesCache).length === 0) await cargarEstaciones();
    if (Object.keys(cajasCache).length === 0) await cargarCajas();

    const idEstacion = 1;
    const nombreEstacion = estacionesCache[idEstacion] || "Desconocida";
    const fechas = generarFechas(fechaInicio, fechaFin);
    let totalCierres = 0;

    console.log(`📆 Procesando desde ${fechaInicio} hasta ${fechaFin} (${fechas.length} días)`);

    for (const fecha of fechas) {
      for (const [idCajaStr, nombreCajaMap] of Object.entries(cajasCache)) {
        const idCaja = Number(idCajaStr);

        if (
          nombreCajaMap.toUpperCase().includes("NO USAR") ||
          nombreCajaMap.toUpperCase().includes("ADMINISTRATIVA")
        ) {
          continue;
        }

        console.log(`📦 Caja ${nombreCajaMap} (ID ${idCaja}) - Fecha ${fecha}`);

        const urlCierres = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
        const resp = await fetch(urlCierres, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        const xml = await resp.text();

        if (!xml || xml.startsWith("<!DOCTYPE")) continue;

        const json = await parseStringPromise(xml, { explicitArray: false });
        const cierres = json?.ArrayOfCierreTurno?.CierreTurno;
        if (!cierres) continue;

        const lista = Array.isArray(cierres) ? cierres : [cierres];

        for (const cierre of lista) {
          const idCierreTurno = Number(cierre.IdCierreTurno);
          const fechaHora = cierre.Fecha;
          const nombreCaja = nombreCajaMap || cierre.Caja || "Desconocida";

          // Evitar cierres recientes (menos de 1h)
          const diffHoras =
            (new Date().getTime() - new Date(fechaHora).getTime()) / (1000 * 60 * 60);
          if (diffHoras < 1) continue;

          // 🔸 Obtener detalle del cierre
          const urlDetalle = `${BASE_URL}/Cierres/GetInformacionCierreTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fechaHoraCierre=${fechaHora}`;
          const detalleResp = await fetch(urlDetalle, {
            headers: { Authorization: `Bearer ${TOKEN}` },
          });
          const xmlDetalle = await detalleResp.text();

          if (!xmlDetalle || xmlDetalle.startsWith("<!DOCTYPE")) {
            console.warn(`⚠️ Detalle inválido para cierre ${idCierreTurno}`);
            continue;
          }

          const jsonDetalle = await parseStringPromise(xmlDetalle, { explicitArray: false });
          const info = jsonDetalle?.InformacionCierreTurno || {};

          // 🔹 Totales generales
          const totalImporte = Number(info?.ImporteVentasTotalesContado || 0);
          const totalLitros = Number(info?.TotalLitrosDespachados || 0);
          const metodoPago = info?.MedioDePago || "N/A";

          // 💾 Insertar en cierres_turno
          await pool.query(
            `INSERT INTO cierres_turno (
               id_cierre_turno, fecha, id_caja, nombre_caja,
               id_estacion, nombre_estacion, importe_total, litros_total, metodo_pago
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id_cierre_turno) DO NOTHING`,
            [
              idCierreTurno,
              new Date(fechaHora),
              idCaja,
              nombreCaja,
              idEstacion,
              nombreEstacion,
              totalImporte,
              totalLitros,
              metodoPago,
            ]
          );

          // 💳 Guardar medios de pago
          const medios = info?.ArrayOfMedioPago?.MedioPago;
          if (medios) {
            const listaPagos = Array.isArray(medios) ? medios : [medios];
            for (const mp of listaPagos) {
              const medio = mp?.Descripcion || "Desconocido";
              const importeMP = Number(mp?.Importe || 0);
              await pool.query(
                `INSERT INTO cierres_medios_pago (id_cierre_turno, medio_pago, importe)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [idCierreTurno, medio, importeMP]
              );
            }
          }

          // 🔹 Artículos despachados
          const articulos = info?.ArticulosDespachados?.InformacionCierreTurnoDetalle;
          if (articulos) {
            const listaArt = Array.isArray(articulos) ? articulos : [articulos];

            for (const art of listaArt) {
              const productoNombre = art?.Articulo?.Descripcion || "Desconocido";
              const productoId = Number(art?.Articulo?.IdArticulo || 0);
              const litros = Number(art?.LitrosDespachados || 0);
              const importe = Number(art?.ImporteTotal || 0);

              // Clasificación automática
              let deptoId = 1;
              if (productoNombre.toUpperCase().includes("GNC")) deptoId = 2;
              else if (productoNombre.toUpperCase().includes("LUBRIC")) deptoId = 3;
              else if (productoNombre.toUpperCase().includes("SHOP")) deptoId = 4;
              else if (productoNombre.toUpperCase().includes("FOOD") || productoNombre.toUpperCase().includes("SPOT"))
                deptoId = 5;

              await pool.query(
                `INSERT INTO datos_metricas (
                   fecha, empresa_id, depto_id, producto_id, cantidad, importe,
                   estacion_id, caja_id, nombre_estacion, nombre_caja, id_cierre_turno
                 )
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (id_cierre_turno, producto_id)
                 DO UPDATE SET cantidad = EXCLUDED.cantidad, importe = EXCLUDED.importe`,
                [
                  new Date(fechaHora),
                  1,
                  deptoId,
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
              console.log(`🛢️ ${productoNombre} (${litros} L) registrado en cierre ${idCierreTurno}`);
            }
          } else {
            console.warn(`⚠️ No hay ArticulosDespachados en cierre ${idCierreTurno}`);
          }

          totalCierres++;
        }
      }
    }

    res.status(200).json({
      ok: true,
      message: "✅ Sincronización completada correctamente",
      totalCierres,
      rango: { desde: fechaInicio, hasta: fechaFin },
    });
  } catch (error) {
    console.error("❌ Error en syncCierresToDB:", (error as Error).message);
    res.status(500).json({ error: "Error al sincronizar cierres" });
  }
};

// ✅ 2. Sincronización automática
export const syncCierresToDBAuto = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query("SELECT MAX(fecha) AS max_fecha FROM datos_metricas");
    let fechaInicio: string = "2023-01-01";
    if (result.rows[0].max_fecha) {
      const lastDate = new Date(result.rows[0].max_fecha ?? "");
      lastDate.setDate(lastDate.getDate() + 1);
      fechaInicio = (lastDate.toISOString().split("T")[0] as string);
    }

    const hoy: string = (new Date().toISOString().split("T")[0] as string);
    console.log(`🗓️ Sincronización automática desde ${fechaInicio} hasta ${hoy}`);

    req.query.fechaInicio = fechaInicio;
    req.query.fechaFin = hoy;
    await syncCierresToDB(req, res);
  } catch (error) {
    console.error("❌ Error en syncCierresToDBAuto:", (error as Error).message);
    res.status(500).json({ error: "Error en sincronización automática" });
  }
};

// ✅ 3. Obtener medios de pago por cierre
export const getMediosPagoByCierre = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idCierreTurno } = req.params;

    if (!idCierreTurno) {
      res.status(400).json({ ok: false, error: "Falta idCierreTurno" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT medio_pago, importe
       FROM cierres_medios_pago
       WHERE id_cierre_turno = $1
       ORDER BY importe DESC`,
      [idCierreTurno]
    );

    if (rows.length === 0) {
      res.status(404).json({ ok: false, message: "No se encontraron medios de pago" });
      return;
    }

    res.status(200).json({
      ok: true,
      id_cierre_turno: idCierreTurno,
      medios_pago: rows.map((r) => ({
        medio_pago: r.medio_pago,
        importe: Number(r.importe),
      })),
    });
  } catch (error) {
    console.error("❌ Error en getMediosPagoByCierre:", (error as Error).message);
    res.status(500).json({ ok: false, error: "Error al obtener medios de pago" });
  }
};
