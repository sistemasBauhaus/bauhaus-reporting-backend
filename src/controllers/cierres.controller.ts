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

// ==========================================================
// 🔹 Utilidades
// ==========================================================

// Cargar estaciones desde la API
async function cargarEstaciones() {
  const res = await fetch(`${BASE_URL}/Estaciones/GetAllEstaciones`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const xml = await res.text();
  if (xml.startsWith("<!DOCTYPE") || xml.startsWith("<html")) {
    console.error("❌ Token inválido o sin autorización al cargar estaciones");
    return;
  }

  const json = await parseStringPromise(xml, { explicitArray: false });
  const estaciones = json?.ArrayOfEstacion?.Estacion || [];
  const arr = Array.isArray(estaciones) ? estaciones : [estaciones];

  estacionesCache = Object.fromEntries(
    arr.map((e: any) => [Number(e.IdEstacion), e.Nombre || e.Descripcion || "Sin nombre"])
  );
  console.log("✅ Estaciones cargadas:", estacionesCache);
}

// Cargar cajas desde la API
async function cargarCajas() {
  const res = await fetch(`${BASE_URL}/Cajas/GetAllCajas`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const xml = await res.text();
  const json = await parseStringPromise(xml, { explicitArray: false });
  const cajas = json?.ArrayOfCaja?.Caja || [];
  const arr = Array.isArray(cajas) ? cajas : [cajas];

  cajasCache = Object.fromEntries(
    arr.map((c: any) => [Number(c.IdCaja), c.Descripcion || c.NombreCaja || "Caja sin nombre"])
  );
  console.log("✅ Cajas cargadas:", cajasCache);
}

// Generar rango de fechas
function generarFechas(desde: string, hasta: string): string[] {
  if (!desde || !hasta) return [];
  const fechas: string[] = [];
  let inicio = new Date(desde);
  const fin = new Date(hasta);
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return [];
  while (inicio <= fin) {
    const fechaISO = !isNaN(inicio.getTime()) ? inicio.toISOString().split("T")[0] : undefined;
    if (typeof fechaISO === "string") {
      fechas.push(fechaISO);
    }
    inicio = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
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

    const idEstacion = 1;
    const nombreEstacion = estacionesCache[idEstacion] || "Desconocida";
    const fechas = generarFechas(fechaInicio, fechaFin);
    let totalCierres = 0;

    console.log(`📆 Procesando desde ${fechaInicio} hasta ${fechaFin} (${fechas.length} días)`);

    for (const fecha of fechas) {
      for (const [idCajaStr, nombreCaja] of Object.entries(cajasCache)) {
        const idCaja = Number(idCajaStr);

        if (nombreCaja.match(/NO USAR|ADMINISTRATIVA/i)) continue;

        console.log(`📦 Caja ${nombreCaja} (ID ${idCaja}) - Fecha ${fecha}`);

        const urlCierres = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
        const resp = await fetch(urlCierres, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const xml = await resp.text();
        if (!xml || xml.startsWith("<!DOCTYPE")) continue;

        const json = await parseStringPromise(xml, { explicitArray: false });
        const cierres = json?.ArrayOfCierreTurno?.CierreTurno;
        if (!cierres) continue;

        const lista = Array.isArray(cierres) ? cierres : [cierres];
        for (const cierre of lista) {
          const idCierreTurno = Number(cierre.IdCierreTurno);
          const fechaHora = cierre.Fecha;

          const diffHoras =
            (Date.now() - new Date(fechaHora).getTime()) / (1000 * 60 * 60);
          if (diffHoras < 1) continue;

          // ===== Detalle cierre =====
          const urlDetalle = `${BASE_URL}/Cierres/GetInformacionCierreTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fechaHoraCierre=${fechaHora}`;
          const detalleResp = await fetch(urlDetalle, { headers: { Authorization: `Bearer ${TOKEN}` } });
          const xmlDetalle = await detalleResp.text();
          if (!xmlDetalle || xmlDetalle.startsWith("<!DOCTYPE")) continue;

          const jsonDetalle = await parseStringPromise(xmlDetalle, { explicitArray: false });
          const info = jsonDetalle?.InformacionCierreTurno || {};

          const totalImporte = Number(info?.ImporteVentasTotalesContado || 0);
          const totalLitros = Number(info?.TotalLitrosDespachados || 0);

          await pool.query(
            `INSERT INTO cierres_turno (
               id_cierre_turno, fecha, id_caja, nombre_caja,
               id_estacion, nombre_estacion, importe_total, litros_total
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id_cierre_turno) DO NOTHING`,
            [idCierreTurno, fechaHora, idCaja, nombreCaja, idEstacion, nombreEstacion, totalImporte, totalLitros]
          );

          const articulos = info?.ArticulosDespachados?.InformacionCierreTurnoDetalle;
          const listaArt = Array.isArray(articulos) ? articulos : articulos ? [articulos] : [];

          // 🔸 Si hay artículos
          if (listaArt.length > 0) {
            for (const art of listaArt) {
              const productoId = Number(art?.Articulo?.IdArticulo || 0);
              const nombreProd = art?.Articulo?.Descripcion?.trim() || "Sin nombre";
              const litros = Number(art?.LitrosDespachados || 0);
              const importe = Number(art?.ImporteTotal || 0);

              // Insertar producto si no existe
              await pool.query(
                `INSERT INTO dim_producto (producto_id, nombre, origen, categoria)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (producto_id) DO NOTHING`,
                [productoId, nombreProd, "Playa", "LIQUIDOS"]
              );

              // Insertar datos métricos sin duplicar
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
                  1, // empresa fija
                  1, // depto: playa
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

              console.log(`🛢️ ${nombreProd} (${litros} L) registrado en cierre ${idCierreTurno}`);
            }
          } else {
            // 🔸 Sin artículos: SHOP u otros
            console.warn(`⚠️ No hay ArticulosDespachados en cierre ${idCierreTurno}`);
            if (/SHOP|FOOD|SPOT/i.test(nombreCaja)) {
              // Insertar producto Golosinas/Bebidas si no existe
              await pool.query(
                `INSERT INTO dim_producto (producto_id, nombre, origen, categoria)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (producto_id) DO NOTHING`,
                [8, "Golosinas/Bebidas", "Shop", "GOLOSINAS"]
              );
              await pool.query(
                `INSERT INTO datos_metricas (
                   fecha, empresa_id, depto_id, producto_id, cantidad, importe,
                   estacion_id, caja_id, nombre_estacion, nombre_caja, id_cierre_turno
                 )
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                 ON CONFLICT (id_cierre_turno, producto_id)
                 DO UPDATE SET importe = EXCLUDED.importe`,
                [
                  fechaHora,
                  1,
                  4, // depto SHOP
                  8, // producto: Golosinas/Bebidas
                  0,
                  totalImporte,
                  idEstacion,
                  idCaja,
                  nombreEstacion,
                  nombreCaja,
                  idCierreTurno,
                ]
              );
            }
          }

          totalCierres++;
        }
      }
    }

    res.status(200).json({
      ok: true,
      message: "✅ Sincronización completada correctamente",
      totalCierres,
    });
  } catch (error) {
    console.error("❌ Error en syncCierresToDB:", (error as Error).message);
    res.status(500).json({ error: "Error al sincronizar cierres" });
  }
};
