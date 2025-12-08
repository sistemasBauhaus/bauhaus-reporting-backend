// src/controllers/facturas.controller.ts
import { Request, Response } from "express";
import { sincronizarFacturas } from "../services/facturas.service";
import { sincronizarRecibos } from "../services/recibos.service";

/**
 * Endpoint para sincronizar facturas manualmente
 * GET/POST /api/facturas/sync?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 */
export const syncFacturas = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    // Normalizar valores de query a strings (pueden venir como string | string[] | undefined)
    const normalizeQuery = (val: any, fallback: string): string => {
      const v = Array.isArray(val) ? val[0] : typeof val === "string" ? val : fallback;
      return (v || fallback) as string;
    };

    // Si no se pasan fechas, usar el día anterior (día cerrado)
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const defaultFecha = (ayer.toISOString().split("T")[0] || new Date().toISOString().split("T")[0]) as string;

    const fechaInicioStr = normalizeQuery(fechaInicio, defaultFecha);
    const fechaFinStr = normalizeQuery(fechaFin, fechaInicioStr || defaultFecha);

    if (!fechaInicio || !fechaFin) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📅 No se pasaron fechas, usando día cerrado (ayer): ${fechaInicioStr}`);
      }
    }

    const resultado = await sincronizarFacturas(fechaInicioStr, fechaFinStr);

    res.status(200).json({
      ok: true,
      message: "✅ Sincronización de facturas completada",
      data: resultado,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("❌ Error al sincronizar facturas:", (error as Error).message);
    }
    res.status(500).json({
      ok: false,
      error: "Error al sincronizar facturas",
      message: (error as Error).message,
    });
  }
};

/**
 * Endpoint para sincronizar recibos manualmente
 * GET/POST /api/recibos/sync?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 */
export const syncRecibos = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    const normalizeQuery = (val: any, fallback: string): string => {
      const v = Array.isArray(val) ? val[0] : typeof val === "string" ? val : fallback;
      return (v || fallback) as string;
    };

    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const defaultFecha = (ayer.toISOString().split("T")[0] || new Date().toISOString().split("T")[0]) as string;

    const fechaInicioStr = normalizeQuery(fechaInicio, defaultFecha);
    const fechaFinStr = normalizeQuery(fechaFin, fechaInicioStr || defaultFecha);

    if (!fechaInicio || !fechaFin) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📅 No se pasaron fechas, usando día cerrado (ayer): ${fechaInicioStr}`);
      }
    }

    const resultado = await sincronizarRecibos(fechaInicioStr, fechaFinStr);

    res.status(200).json({
      ok: true,
      message: "✅ Sincronización de recibos completada",
      data: resultado,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("❌ Error al sincronizar recibos:", (error as Error).message);
    }
    res.status(500).json({
      ok: false,
      error: "Error al sincronizar recibos",
      message: (error as Error).message,
    });
  }
};

/**
 * Endpoint para sincronizar ambos (facturas y recibos) de una vez
 * POST /api/sync-facturacion?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 */
export const syncFacturacionCompleta = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    const normalizeQuery = (val: any, fallback: string): string => {
      const v = Array.isArray(val) ? val[0] : typeof val === "string" ? val : fallback;
      return (v || fallback) as string;
    };

    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const defaultFecha = (ayer.toISOString().split("T")[0] || new Date().toISOString().split("T")[0]) as string;

    const fechaInicioStr = normalizeQuery(fechaInicio, defaultFecha);
    const fechaFinStr = normalizeQuery(fechaFin, fechaInicioStr || defaultFecha);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔄 Iniciando sincronización completa desde ${fechaInicioStr} hasta ${fechaFinStr}`);
    }

    const [resultFacturas, resultRecibos] = await Promise.all([
      sincronizarFacturas(fechaInicioStr, fechaFinStr),
      sincronizarRecibos(fechaInicioStr, fechaFinStr),
    ]);

    res.status(200).json({
      ok: true,
      message: "✅ Sincronización completa exitosa",
      data: {
        facturas: resultFacturas,
        recibos: resultRecibos,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("❌ Error en sincronización completa:", (error as Error).message);
    }
    res.status(500).json({
      ok: false,
      error: "Error en sincronización completa",
      message: (error as Error).message,
    });
  }
};

/**
 * Endpoint para descargar historia completa desde 2020
 * POST /api/sync-historia
 */
export const syncHistoria = async (req: Request, res: Response): Promise<void> => {
  try {
    const fechaInicio = "2020-01-01";
    const fechaFin = (new Date().toISOString().split("T")[0] || new Date().toISOString().split("T")[0]) as string;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📚 Iniciando descarga de historia desde ${fechaInicio} hasta ${fechaFin}`);
    }

    // Dividir en períodos mensuales para evitar timeouts
    const periodos = generarPeriodosMensuales(fechaInicio, fechaFin);
    const resultados = [];

    for (const periodo of periodos) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`📅 Procesando período: ${periodo.inicio} - ${periodo.fin}`);
      }

      const [resultFacturas, resultRecibos] = await Promise.all([
        sincronizarFacturas(periodo.inicio, periodo.fin),
        sincronizarRecibos(periodo.inicio, periodo.fin),
      ]);

      resultados.push({
        periodo: `${periodo.inicio} - ${periodo.fin}`,
        facturas: resultFacturas,
        recibos: resultRecibos,
      });

      // Pequeña pausa entre períodos para no sobrecargar la API
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    res.status(200).json({
      ok: true,
      message: "✅ Descarga de historia completada",
      periodos: resultados.length,
      data: resultados,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("❌ Error al descargar historia:", (error as Error).message);
    }
    res.status(500).json({
      ok: false,
      error: "Error al descargar historia",
      message: (error as Error).message,
    });
  }
};

/**
 * Genera períodos mensuales para la descarga de historia
 */
function generarPeriodosMensuales(
  fechaInicio: string,
  fechaFin: string
): Array<{ inicio: string; fin: string }> {
  const periodos: Array<{ inicio: string; fin: string }> = [];
  let actual = new Date(fechaInicio);
  const fin = new Date(fechaFin);

  while (actual <= fin) {
    const inicioMes = new Date(actual.getFullYear(), actual.getMonth(), 1);
    const finMes = new Date(actual.getFullYear(), actual.getMonth() + 1, 0);

    // Ajustar si el último mes está incompleto
    if (finMes > fin) {
      finMes.setTime(fin.getTime());
    }

    periodos.push({
      inicio: inicioMes.toISOString().split("T")[0] || "",
      fin: finMes.toISOString().split("T")[0] || "",
    });

    // Avanzar al siguiente mes
    actual.setMonth(actual.getMonth() + 1);
  }

  return periodos;
}

/**
 * Obtener logs de sincronización
 * GET /api/logs-facturacion?tipo=FACTURAS|RECIBOS&limit=50
 */
export const getLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tipo, limit = "50" } = req.query;
    const { pool } = await import("../db/connection");

    let query = `
      SELECT * FROM logs_ingesta
      WHERE estado LIKE '%FACTURAS%' OR estado LIKE '%RECIBOS%'
    `;
    const params: any[] = [];

    if (tipo === "FACTURAS") {
      query = `SELECT * FROM logs_ingesta WHERE estado LIKE '%FACTURAS%'`;
    } else if (tipo === "RECIBOS") {
      query = `SELECT * FROM logs_ingesta WHERE estado LIKE '%RECIBOS%'`;
    }

    query += ` ORDER BY fecha DESC LIMIT $1`;
    params.push(parseInt(limit as string));

    const { rows } = await pool.query(query, params);

    res.status(200).json({
      ok: true,
      data: rows,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("❌ Error al obtener logs:", (error as Error).message);
    }
    res.status(500).json({
      ok: false,
      error: "Error al obtener logs",
    });
  }
};