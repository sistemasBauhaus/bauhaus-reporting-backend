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
    const fecha = "2025-10-21";

    const urlCierres = `${BASE_URL}/Cierres/GetUltimosCierresTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fecha=${fecha}`;
    const responseCierres = await fetch(urlCierres, {
      method: "GET",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    const xmlCierres = await responseCierres.text();
    const jsonCierres = await parseStringPromise(xmlCierres, { explicitArray: false });
    const cierres = jsonCierres.ArrayOfCierreTurno.CierreTurno;
    const lista: CierreTurno[] = Array.isArray(cierres) ? cierres : [cierres];

    console.log(`📦 ${lista.length} cierres encontrados`);

    for (const cierre of lista) {
      const fechaHora = cierre.Fecha;
      const urlDetalle = `${BASE_URL}/Cierres/GetInformacionCierreTurno?idEstacion=${idEstacion}&idCaja=${idCaja}&fechaHoraCierre=${fechaHora}`;
      const responseDetalle = await fetch(urlDetalle, {
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      const xmlDetalle = await responseDetalle.text();
      const jsonDetalle = await parseStringPromise(xmlDetalle, { explicitArray: false });
      const info = jsonDetalle.InformacionCierreTurno;

      const totalImporte = Number(info?.ImporteVentasTotalesContado || 0);
      const totalLitros = Number(info?.TotalLitrosDespachados || 0);
      const totalEfectivo = Number(info?.TotalEfectivoRecaudado || 0);

      // 🧠 Mapear según tipo de caja
      let productoId = 1;
      let deptoId = 1;

      const caja = cierre.Caja?.toUpperCase() || "";
      if (caja.includes("PLAYA")) {
        deptoId = 1; // Playa
        productoId = 4; // Nafta Súper
      } else if (caja.includes("SHOP")) {
        deptoId = 2; // Shop
        productoId = 8; // Golosinas
      } else if (caja.includes("LUBRIC")) {
        deptoId = 3; // Lubricantes
        productoId = 7; // Aceite Lubricante
      }

      console.log(`💾 Guardando cierre ${cierre.IdCierreTurno} - Caja: ${caja}, Producto: ${productoId}`);

      await pool.query(
        `INSERT INTO datos_metricas (fecha, empresa_id, depto_id, producto_id, cantidad, importe)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          new Date(fechaHora),
          1, // empresa Bauhaus
          deptoId,
          productoId,
          totalLitros,
          totalImporte || totalEfectivo,
        ]
      );
    }

    res.status(200).json({ ok: true, message: "Sincronización completada correctamente" });
  } catch (error) {
    console.error("❌ Error al sincronizar:", (error as Error).message);
    res.status(500).json({ error: "Error al sincronizar cierres" });
  }
};

