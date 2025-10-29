// ✅ 4. Sincronizar automáticamente desde la última fecha de cierre hasta hoy
export const syncCierresToDBAuto = async (req: Request, res: Response): Promise<void> => {
  try {
    // Buscar la última fecha cargada
    const result = await pool.query('SELECT MAX(fecha) as max_fecha FROM datos_metricas');
    let fechaInicio: string;
    if (result.rows[0].max_fecha) {
      // Sumar un día a la última fecha encontrada
      const lastDate = new Date(result.rows[0].max_fecha);
      lastDate.setDate(lastDate.getDate() + 1);
      const iso = lastDate.toISOString();
      const fechaSolo = iso.split('T');
      fechaInicio = typeof fechaSolo[0] === 'string' ? fechaSolo[0] : '2023-01-01';
    } else {
      // Si no hay datos, usar una fecha de inicio por defecto
      fechaInicio = '2023-01-01';
    }
    // Fecha de fin: hoy
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const fechaFin = `${yyyy}-${mm}-${dd}`;

    // Llamar a la función de sincronización existente
    req.query.fechaInicio = fechaInicio;
    req.query.fechaFin = fechaFin;
    // @ts-ignore
    await syncCierresToDB(req, res);
  } catch (error) {
    console.error('❌ Error en syncCierresToDBAuto:', (error as Error).message);
    res.status(500).json({ error: 'Error en la sincronización automática de cierres' });
  }
};
import fetch from "node-fetch";
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

// ✅ 1. Obtener lista de cierres (ya la tenés)
export const descargarCierres = async (req: Request, res: Response): Promise<void> => {
  try {
    const idEstacion = 1;
    const idCaja = 2;
    const fecha = "2025-10-21";

    const url = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    const xml = await response.text();
    const json = await parseStringPromise(xml, { explicitArray: false });
    const cierres = json.ArrayOfCierreTurno.CierreTurno;
    const lista: CierreTurno[] = Array.isArray(cierres) ? cierres : [cierres];

    res.status(200).json({ ok: true, cantidad: lista.length, data: lista });
  } catch (error) {
    console.error("❌ Error en descargarCierres:", (error as Error).message);
    res.status(500).json({ error: "No se pudieron obtener los cierres" });
  }
};

// ✅ 2. Obtener detalle de un cierre específico (ya lo probaste)
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

// ✅ 3. Nueva función: sincronizar cierres del día con tu base de datos
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

    // 📅 Generar todas las fechas entre inicio y fin
    const fechas: string[] = [];
    const fechaInicioStr = String(fechaInicio);
    const fechaFinStr = String(fechaFin);
    let d = new Date(fechaInicioStr);
    const fin = new Date(fechaFinStr);

    while (d <= fin) {
      if (d instanceof Date && !isNaN(d.getTime())) {
        const iso: string = d.toISOString();
        if (iso) {
          const fechaSolo = iso.split("T");
          const fechaStr = fechaSolo[0];
          if (typeof fechaStr === 'string') {
            fechas.push(fechaStr);
          } else {
            console.warn(`⚠️ No se pudo extraer la fecha de ISOString: ${iso}`);
          }
        } else {
          console.warn(`⚠️ No se pudo convertir la fecha a ISOString: ${d}`);
        }
      } else {
        console.warn(`⚠️ Fecha inválida detectada: ${d}`);
      }
      d.setDate(d.getDate() + 1);
    }

    let totalCierres = 0;
    const totalDias = fechas.length;

    console.log(`📆 Descargando cierres desde ${fechas[0]} hasta ${fechas[fechas.length - 1]}`);
    console.log(`📊 Total de días a procesar: ${totalDias}`);

    for (let i = 0; i < totalDias; i++) {
      const fecha = fechas[i];
      const progreso = ((i + 1) / totalDias * 100).toFixed(1);
      console.log(`📅 (${i + 1}/${totalDias}) Procesando ${fecha} — Progreso: ${progreso}%`);

      const urlCierres = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
      const respCierres = await fetch(urlCierres, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      const xml = await respCierres.text();
      const json = await parseStringPromise(xml, { explicitArray: false });

      const cierres = json?.ArrayOfCierreTurno?.CierreTurno;
      if (!cierres) {
        console.log(`⚠️ No hay cierres para ${fecha}`);
        continue;
      }

      const lista = Array.isArray(cierres) ? cierres : [cierres];
      totalCierres += lista.length;

      for (const cierre of lista) {
        const fechaHora: string | undefined = cierre.Fecha;
        if (!fechaHora) {
          console.warn(`⚠️ Cierre ${cierre.IdCierreTurno} sin fecha. Se omite.`);
          continue;
        }

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

        // 🧠 Mapear según tipo de caja
        let productoId = 1;
        let deptoId = 1;

        const caja = cierre.Caja?.toUpperCase() || "";
        if (caja.includes("PLAYA")) {
          deptoId = 1;
          productoId = 4;
        } else if (caja.includes("SHOP")) {
          deptoId = 2;
          productoId = 8;
        } else if (caja.includes("LUBRIC")) {
          deptoId = 3;
          productoId = 7;
        }

        await pool.query(
          `INSERT INTO datos_metricas (fecha, empresa_id, depto_id, producto_id, cantidad, importe)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            new Date(fechaHora), // ✅ TypeScript ya sabe que es string
            1,
            deptoId,
            productoId,
            totalLitros,
            totalImporte || totalEfectivo,
          ]
        );

        console.log(`💾 Guardado cierre ${cierre.IdCierreTurno} (${caja})`);
      }
    }

    console.log(`✅ Sincronización completada: ${totalCierres} cierres cargados`);
    res.status(200).json({
      ok: true,
      message: "✅ Sincronización completada correctamente",
      totalCierres,
      rango: { desde: fechaInicio, hasta: fechaFin },
    });
  } catch (error) {
    console.error("❌ Error al sincronizar:", (error as Error).message);
    res.status(500).json({ error: "Error al sincronizar cierres" });
  }
};



