import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import dotenv from "dotenv";
import { Request, Response } from "express";

dotenv.config();

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

// ==========================================================
// 🔹 Función para convertir formato de fecha
// ==========================================================
// Convierte YYYY-MM-DD (formato de entrada según documentación) a YYYYMMDD (formato para API externa)
function convertirFecha(fecha: string): string {
  // Si viene en formato YYYY-MM-DD, convertir a YYYYMMDD
  if (fecha.includes("-")) {
    const partes = fecha.split("-");
    if (partes.length === 3) {
      const [anio, mes, dia] = partes;
      if (anio && mes && dia) {
        return `${anio}${mes.padStart(2, "0")}${dia.padStart(2, "0")}`;
      }
    }
  }
  // Si ya viene en formato YYYYMMDD, devolverlo tal cual
  return fecha.replace(/-/g, "");
}

// ==========================================================
// 🔹 Controlador principal
// ==========================================================
export const getRecibosEntreFechas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { desdeFecha, hastaFecha } = req.query;

    if (!desdeFecha || !hastaFecha) {
      res.status(400).json({ 
        error: "Debes enviar desdeFecha y hastaFecha como parámetros de consulta (formato YYYY-MM-DD)",
        ejemplo: "/api/CtaCte/GetRecibosEntreFechas?desdeFecha=2023-01-01&hastaFecha=2023-01-31"
      });
      return;
    }

    // Convertir fechas al formato esperado por la API (YYYYMMDD)
    const desdeFechaFormato = convertirFecha(desdeFecha as string);
    const hastaFechaFormato = convertirFecha(hastaFecha as string);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📄 Obteniendo recibos desde ${desdeFechaFormato} hasta ${hastaFechaFormato}`);
    }

    // Llamar a la API externa
    const url = `${BASE_URL}/CtaCte/GetRecibosEntreFechas?desdeFecha=${desdeFechaFormato}&hastaFecha=${hastaFechaFormato}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!response.ok) {
      res.status(response.status).json({ 
        error: `Error al obtener recibos: ${response.statusText}` 
      });
      return;
    }

    const xml = await response.text();

    // Verificar si la respuesta es un error HTML
    if (xml.startsWith("<!DOCTYPE") || xml.startsWith("<html")) {
      res.status(500).json({ 
        error: "Error en la respuesta de la API externa",
        detalle: "La API devolvió una respuesta HTML en lugar de XML"
      });
      return;
    }

    // Parsear XML a JSON
    const json = await parseStringPromise(xml, { explicitArray: false });

    // Extraer los recibos del XML parseado
    // Nota: El nombre exacto del elemento puede variar según la API
    // Intentamos diferentes variaciones comunes
    const recibosRaw = json?.ArrayOfRecibo?.Recibo || 
                      json?.ArrayOfReciboCtaCte?.ReciboCtaCte ||
                      json?.Recibos?.Recibo ||
                      json?.Recibo;

    let recibos: any[] = [];

    if (recibosRaw) {
      recibos = Array.isArray(recibosRaw) ? recibosRaw : [recibosRaw];
    }

    // Mapear a formato exacto según documentación: IdRecibo, FechaEmision, Monto, IdCliente, NombreCliente
    const recibosMapeados = recibos.map((recibo: any) => {
      // Extraer campos según documentación
      const idRecibo = recibo.IdRecibo || recibo.idRecibo || recibo.Id || null;
      const fechaEmision = recibo.FechaEmision || recibo.Fecha || recibo.fecha || null;
      const monto = recibo.Monto || recibo.monto || recibo.Importe || recibo.importe || 0;
      const idCliente = recibo.IdCliente || recibo.idCliente || null;
      const nombreCliente = recibo.NombreCliente || recibo.nombreCliente || recibo.Cliente || recibo.cliente || "Sin nombre";

      return {
        IdRecibo: Number(idRecibo) || null,
        FechaEmision: fechaEmision || null,
        Monto: Number(monto) || 0,
        IdCliente: Number(idCliente) || null,
        NombreCliente: nombreCliente
      };
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Se obtuvieron ${recibosMapeados.length} recibos`);
    }

    res.status(200).json(recibosMapeados);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("❌ Error en getRecibosEntreFechas:", (error as Error).message);
    }
    res.status(500).json({ 
      error: "Error al obtener recibos",
      detalle: (error as Error).message 
    });
  }
};

