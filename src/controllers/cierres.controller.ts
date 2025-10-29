import fetch from "node-fetch";
import { estacionesMap, cajasMap } from "../utils/mapeos";
import { parseStringPromise } from "xml2js";
import dotenv from "dotenv";
import { Request, Response } from "express";
import { pool } from "../db/connection";


dotenv.config();

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

interface CierreTurno {
  Fecha: string;
  IdCierreTurno: string;
  NumeroTurno: string;
  IdCaja: string;
  Caja: string;
  IdCierreCajaTesoreria: string;
}

// ✅ 1. Obtener lista de cierres (solo consulta directa)
export const descargarCierres = async (req: Request, res: Response): Promise<void> => {
  try {
    const idEstacion = 1;
    const idCaja = 2;
    const fecha = req.query.fecha || "2025-10-21";

    const url = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    const xml = await response.text();
    const json = await parseStringPromise(xml, { explicitArray: false });

    const cierres = json?.ArrayOfCierreTurno?.CierreTurno;
    const lista: CierreTurno[] = Array.isArray(cierres) ? cierres : [cierres];

    res.status(200).json({ ok: true, cantidad: lista.length, data: lista });
  } catch (error) {
    console.error("❌ Error en descargarCierres:", (error as Error).message);
    res.status(500).json({ error: "No se pudieron obtener los cierres" });
  }
};

// ✅ 2. Obtener detalle de un cierre específico
export const obtenerDetalleCierre = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idEstacion = 1, idCaja = 2, fechaHoraCierre } = req.query;

    if (!fechaHoraCierre) {
      res.status(400).json({ error: "Falta parámetro fechaHoraCierre" });
      return;
    }

    const url = `${BASE_URL}/Cierres/GetInformacionCierreTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fechaHoraCierre=${fechaHoraCierre}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    const xml = await response.text();
    const json = await parseStringPromise(xml, { explicitArray: false });
    res.json(json);
  } catch (error) {
    console.error("❌ Error al obtener detalle:", (error as Error).message);
    res.status(500).json({ error: "No se pudo obtener detalle del cierre" });
  }
};

// ✅ 3. Sincronizar cierres manualmente por rango de fechas
export const syncCierresToDB = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("🔁 Iniciando sincronización de cierres...");

    const idEstacion = 1;
    const idCaja = 2;
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      res.status(400).json({ error: "Debes enviar fechaInicio y fechaFin en el query string" });
      return;
    }

    // Generar fechas entre inicio y fin
    const fechas: string[] = [];
    let d = new Date(String(fechaInicio));
    const fin = new Date(String(fechaFin));

    while (d <= fin) {
      if (d && !isNaN(d.getTime())) {
        fechas.push(d.toISOString().split("T")[0] as string);
      }
      d.setDate(d.getDate() + 1);
    }

    let totalCierres = 0;
    console.log(`📆 Descargando cierres desde ${fechas[0]} hasta ${fechas[fechas.length - 1]} (${fechas.length} días)`);

    for (let i = 0; i < fechas.length; i++) {
      const fecha = fechas[i];
      const progreso = ((i + 1) / fechas.length * 100).toFixed(1);
      console.log(`📅 (${i + 1}/${fechas.length}) Procesando ${fecha} — ${progreso}%`);

      const urlCierres = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
      const respCierres = await fetch(urlCierres, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      const xml = await respCierres.text();
      const json = await parseStringPromise(xml, { explicitArray: false });

      const cierres = json?.ArrayOfCierreTurno?.CierreTurno;
      if (!cierres) {
        console.log(`⚠️ Sin cierres en ${fecha}`);
        continue;
      }

      const lista = Array.isArray(cierres) ? cierres : [cierres];
      totalCierres += lista.length;

      for (const cierre of lista) {
        const fechaHora = cierre.Fecha;
        if (!fechaHora) continue;

        const urlDetalle = `${BASE_URL}/Cierres/GetInformacionCierreTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fechaHoraCierre=${fechaHora}`;
        const respDetalle = await fetch(urlDetalle, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        });

        const xmlDetalle = await respDetalle.text();
        const jsonDetalle = await parseStringPromise(xmlDetalle, { explicitArray: false });
        const info = jsonDetalle?.InformacionCierreTurno || {};

        const totalImporte = Number(info?.ImporteVentasTotalesContado || 0);
        const totalLitros = Number(info?.TotalLitrosDespachados || 0);
        const totalEfectivo = Number(info?.TotalEfectivoRecaudado || 0);

        let productoId = 1;
        let deptoId = 1;
        const caja = cierre.Caja?.toUpperCase() || "";

        if (caja.includes("PLAYA")) {
          deptoId = 1; productoId = 4;
        } else if (caja.includes("SHOP")) {
          deptoId = 2; productoId = 8;
        } else if (caja.includes("LUBRIC")) {
          deptoId = 3; productoId = 7;
        }

        const nombreEstacion = estacionesMap[idEstacion] || '';
        const nombreCaja = cajasMap[cierre.IdCaja] || '';
        const nombre = caja.nombreCaja || caja.NombreCaja || caja.nombrecaja || caja.nombre || caja.NOMBRECAJA || caja.descripcion;
        console.log('idEstacion:', idEstacion, '->', estacionesMap[idEstacion]);
        console.log('IdCaja:', cierre.IdCaja, '->', cajasMap[cierre.IdCaja]);
        console.log('Insertando:', {
          idEstacion, nombreEstacion, idCaja: cierre.IdCaja, nombreCaja
        });
        await pool.query(
          `INSERT INTO datos_metricas (
             fecha, empresa_id, depto_id, producto_id, cantidad, importe,
             estacion_id, caja_id, nombre_estacion, nombre_caja, id_cierre_turno
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (estacion_id, caja_id, id_cierre_turno) DO NOTHING`,
          [
            new Date(fechaHora),
            1,
            deptoId,
            productoId,
            totalLitros,
            totalImporte || totalEfectivo,
            idEstacion,
            cierre.IdCaja,
            nombreEstacion, // <--- debe ser el del mapeo
            nombreCaja,     // <--- debe ser el del mapeo
            cierre.IdCierreTurno
          ]
        );
      }
    }

    console.log(`✅ Sincronización completada (${totalCierres} cierres cargados)`);
    res.status(200).json({
      ok: true,
      message: "Sincronización completada correctamente",
      totalCierres,
      rango: { desde: fechaInicio, hasta: fechaFin }
    });
  } catch (error) {
    console.error("❌ Error al sincronizar:", (error as Error).message);
    res.status(500).json({ error: "Error al sincronizar cierres" });
  }
};

// ✅ 4. Sincronizar automáticamente desde la última fecha hasta hoy
export const syncCierresToDBAuto = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query('SELECT MAX(fecha) AS max_fecha FROM datos_metricas');
    let fechaInicio: string;

    if (result.rows[0].max_fecha) {
      const lastDate = new Date(result.rows[0].max_fecha);
      lastDate.setDate(lastDate.getDate() + 1);
  fechaInicio = lastDate.toISOString().split("T")[0] as string;
    } else {
      fechaInicio = "2023-01-01";
    }

    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, "0");
    const dd = String(hoy.getDate()).padStart(2, "0");
    const fechaFin = `${yyyy}-${mm}-${dd}`;

    console.log(`🗓️ Sincronizando automáticamente desde ${fechaInicio} hasta ${fechaFin}`);

    // Reutiliza la lógica principal
    req.query.fechaInicio = fechaInicio;
    req.query.fechaFin = fechaFin;
    // @ts-ignore
    await syncCierresToDB(req, res);
  } catch (error) {
    console.error("❌ Error en syncCierresToDBAuto:", (error as Error).message);
    res.status(500).json({ error: "Error en sincronización automática" });
  }
};



