import { Request, Response } from "express";
import { pool } from "../db/connection";

// Convierte cualquier valor a número seguro (0 si null, undefined, string vacío, NaN)
const safeNumber = (val: any) => Number(val) || 0;

// Subdiario: una fila por día, columnas fijas por producto/categoría
export const getReporteSubdiario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    console.log("🔍 [DEBUG] getReporteSubdiario - Inicio");
    console.log("🔍 [DEBUG] Query params recibidos:", { fechaInicio, fechaFin });
    console.log("🔍 [DEBUG] URL completa:", req.url);
    console.log("🔍 [DEBUG] Método HTTP:", req.method);

    const query = `
      SELECT
        m.fecha::date,
        m.estacion_id,
        m.nombre_estacion,
        m.caja_id,
        m.nombre_caja,
        d.categoria,
        d.nombre,
        SUM(m.cantidad) AS litros,
        SUM(m.importe) AS importe,
        COALESCE(ct.total_efectivo_recaudado, 0) AS total_efectivo_recaudado,
        COALESCE(ct.importe_ventas_totales_contado, 0) AS importe_ventas_totales_contado
      FROM datos_metricas m
      JOIN dim_producto d USING (producto_id)
      LEFT JOIN cierres_turno ct ON ct.fecha::date = m.fecha::date AND ct.id_estacion = m.estacion_id AND ct.id_caja = m.caja_id
      WHERE ($1::date IS NULL OR m.fecha >= $1::date)
        AND ($2::date IS NULL OR m.fecha <= $2::date)
      GROUP BY m.fecha::date, m.estacion_id, m.nombre_estacion, m.caja_id, m.nombre_caja, d.categoria, d.nombre, ct.total_efectivo_recaudado, ct.importe_ventas_totales_contado
      ORDER BY m.fecha::date, m.estacion_id, m.caja_id, d.categoria;
    `;

    const params = [fechaInicio || null, fechaFin || null];
    console.log("🔍 [DEBUG] Parámetros de consulta SQL:", params);
    console.log("🔍 [DEBUG] Ejecutando consulta SQL...");

    const { rows } = await pool.query(query, params);
    
    console.log("🔍 [DEBUG] Consulta ejecutada exitosamente");
    console.log("🔍 [DEBUG] Número de registros obtenidos:", rows.length);
    console.log("🔍 [DEBUG] Primeros 3 registros (muestra):", rows.slice(0, 3));

    const response = { ok: true, data: rows };
    console.log("🔍 [DEBUG] Enviando respuesta. Total registros:", rows.length);
    
    res.status(200).json(response);
    console.log("✅ [DEBUG] Respuesta enviada exitosamente");
  } catch (error) {
    console.error("❌ [DEBUG] Error en reporte subdiario:", (error as Error).message);
    console.error("❌ [DEBUG] Stack trace:", (error as Error).stack);
    res.status(500).json({ 
      error: "Error al obtener reporte subdiario",
      detalle: (error as Error).message 
    });
  }
};

// Reporte agrupado por empresa (unidades-empresa)
export const getReporteUnidadesEmpresa = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("🔍 [DEBUG] getReporteUnidadesEmpresa - Inicio");
    console.log("🔍 [DEBUG] Query params recibidos:", req.query);

    let { fechaInicio, fechaFin } = req.query;

    // Si no se pasan fechas, usar el mes actual
    if (!fechaInicio || !fechaFin) {
      console.log("🔍 [DEBUG] No se proporcionaron fechas, usando mes actual");
      const now = new Date();
      const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1);
      const yyyy = primerDiaMes.getFullYear();
      const mm = String(primerDiaMes.getMonth() + 1).padStart(2, '0');
      const dd = String(primerDiaMes.getDate()).padStart(2, '0');
      fechaInicio = `${yyyy}-${mm}-${dd}`;
      const yyyy2 = now.getFullYear();
      const mm2 = String(now.getMonth() + 1).padStart(2, '0');
      const dd2 = String(now.getDate()).padStart(2, '0');
      fechaFin = `${yyyy2}-${mm2}-${dd2}`;
      console.log("🔍 [DEBUG] Fechas calculadas (mes actual):", { fechaInicio, fechaFin });
    }

    // Consulta agrupada por empresa
    const query = `
      SELECT
        e.empresa_id,
        e.nombre AS nombre_empresa,
        COUNT(DISTINCT m.estacion_id) AS total_estaciones,
        COUNT(DISTINCT m.caja_id) AS total_cajas,
        SUM(m.cantidad) AS total_unidades,
        SUM(m.importe) AS total_importe,
        COUNT(DISTINCT m.fecha::date) AS dias_con_actividad
      FROM datos_metricas m
      JOIN empresas e ON e.empresa_id = m.empresa_id
      WHERE ($1::date IS NULL OR m.fecha >= $1::date)
        AND ($2::date IS NULL OR m.fecha <= $2::date)
      GROUP BY e.empresa_id, e.nombre
      ORDER BY e.nombre;
    `;

    const params = [fechaInicio || null, fechaFin || null];
    console.log("🔍 [DEBUG] Parámetros de consulta SQL:", params);
    console.log("🔍 [DEBUG] Ejecutando consulta SQL...");

    const { rows } = await pool.query(query, params);

    console.log("🔍 [DEBUG] Consulta ejecutada exitosamente");
    console.log("🔍 [DEBUG] Número de empresas encontradas:", rows.length);
    console.log("🔍 [DEBUG] Primeras 3 empresas (muestra):", rows.slice(0, 3));

    const data = rows.map((r: any) => ({
      empresa_id: Number(r.empresa_id),
      nombre_empresa: r.nombre_empresa,
      total_estaciones: Number(r.total_estaciones || 0),
      total_cajas: Number(r.total_cajas || 0),
      total_unidades: Number(r.total_unidades || 0),
      total_importe: Number(r.total_importe || 0),
      dias_con_actividad: Number(r.dias_con_actividad || 0)
    }));

    const response = { ok: true, data };
    console.log("🔍 [DEBUG] Enviando respuesta. Total empresas:", data.length);

    res.status(200).json(response);
    console.log("✅ [DEBUG] Respuesta enviada exitosamente");
  } catch (error) {
    console.error("❌ [DEBUG] Error en getReporteUnidadesEmpresa:", (error as Error).message);
    console.error("❌ [DEBUG] Stack trace:", (error as Error).stack);
    res.status(500).json({ 
      error: "Error al obtener reporte unidades-empresa",
      detalle: (error as Error).message 
    });
  }
};

export const getReporteMensual = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("🔍 [DEBUG] getReporteMensual - Inicio");
    console.log("🔍 [DEBUG] Query params recibidos:", req.query);
    console.log("🔍 [DEBUG] URL completa:", req.url);
    console.log("🔍 [DEBUG] Método HTTP:", req.method);

    let { fechaInicio, fechaFin } = req.query;
    console.log("🔍 [DEBUG] Fechas antes de procesamiento:", { fechaInicio, fechaFin });

    // Si no se pasan fechas, usar el mes en curso
    if (!fechaInicio || !fechaFin) {
      console.log("🔍 [DEBUG] No se proporcionaron fechas, usando mes actual");
      const now = new Date();
      const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1);
      const yyyy = primerDiaMes.getFullYear();
      const mm = String(primerDiaMes.getMonth() + 1).padStart(2, '0');
      const dd = String(primerDiaMes.getDate()).padStart(2, '0');
      fechaInicio = `${yyyy}-${mm}-${dd}`;
      const yyyy2 = now.getFullYear();
      const mm2 = String(now.getMonth() + 1).padStart(2, '0');
      const dd2 = String(now.getDate()).padStart(2, '0');
      fechaFin = `${yyyy2}-${mm2}-${dd2}`;
      console.log("🔍 [DEBUG] Fechas calculadas (mes actual):", { fechaInicio, fechaFin });
    }

    // Consulta los totales generales desde cierres_turno
    const queryTotales = `
      SELECT
        fecha::date AS fecha,
        id_estacion,
        nombre_estacion,
        caja_id,
        nombre_caja,
        total_efectivo_recaudado,
        importe_ventas_totales_contado
      FROM cierres_turno
      WHERE fecha >= $1 AND fecha <= $2
      ORDER BY fecha::date, id_estacion, caja_id;
    `;

    const params = [fechaInicio, fechaFin];
    console.log("🔍 [DEBUG] Parámetros de consulta SQL:", params);
    console.log("🔍 [DEBUG] Ejecutando consulta SQL...");

    const { rows } = await pool.query(queryTotales, params);

    console.log("🔍 [DEBUG] Consulta ejecutada exitosamente");
    console.log("🔍 [DEBUG] Número de registros obtenidos:", rows.length);
    console.log("🔍 [DEBUG] Primeros 3 registros (muestra):", rows.slice(0, 3));

    const response = { ok: true, data: rows };
    console.log("🔍 [DEBUG] Enviando respuesta. Total registros:", rows.length);

    res.status(200).json(response);
    console.log("✅ [DEBUG] Respuesta enviada exitosamente");
  } catch (error) {
    console.error("❌ [DEBUG] Error al obtener reporte mensual:", (error as Error).message);
    console.error("❌ [DEBUG] Stack trace:", (error as Error).stack);
    res.status(500).json({ 
      error: "Error al obtener reporte mensual",
      detalle: (error as Error).message 
    });
  }
};
