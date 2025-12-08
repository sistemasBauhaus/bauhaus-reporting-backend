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
export const getFacturasVenta = async (req: Request, res: Response): Promise<void> => {
  try {
    const { desdeFecha, hastaFecha } = req.query;

    if (!desdeFecha || !hastaFecha) {
      res.status(400).json({ 
        error: "Debes enviar desdeFecha y hastaFecha como parámetros de consulta (formato YYYY-MM-DD)",
        ejemplo: "/api/Facturacion/GetFacturasVenta?desdeFecha=2023-01-01&hastaFecha=2023-01-31"
      });
      return;
    }

    // Convertir fechas al formato esperado por la API (YYYYMMDD)
    const desdeFechaFormato = convertirFecha(desdeFecha as string);
    const hastaFechaFormato = convertirFecha(hastaFecha as string);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📄 Obteniendo facturas de venta desde ${desdeFechaFormato} hasta ${hastaFechaFormato}`);
    }

    // Llamar a la API externa
    const url = `${BASE_URL}/Facturacion/GetFacturasVenta?desdeFecha=${desdeFechaFormato}&hastaFecha=${hastaFechaFormato}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    if (!response.ok) {
      res.status(response.status).json({ 
        error: `Error al obtener facturas: ${response.statusText}` 
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

    // Extraer las facturas del XML parseado
    const facturasRaw = json?.ArrayOfFacturaVenta?.FacturaVenta;
    let facturas: any[] = [];

    if (facturasRaw) {
      facturas = Array.isArray(facturasRaw) ? facturasRaw : [facturasRaw];
    }

    // Mapear a formato exacto según documentación
    const facturasMapeadas = facturas.map((factura: any) => ({
      IdFactura: Number(factura.IdFactura) || null,
      FechaEmision: factura.FechaEmision || null,
      MontoTotal: Number(factura.MontoTotal) || 0,
      NombreCliente: factura.NombreCliente || "Sin nombre"
    }));

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ Se obtuvieron ${facturasMapeadas.length} facturas de venta`);
    }

    res.status(200).json(facturasMapeadas);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("❌ Error en getFacturasVenta:", (error as Error).message);
    }
    res.status(500).json({ 
      error: "Error al obtener facturas de venta",
      detalle: (error as Error).message 
    });
  }
};

