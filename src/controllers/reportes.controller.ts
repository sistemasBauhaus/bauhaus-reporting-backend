// Subdiario: una fila por día, columnas fijas por producto/categoría
export const getReporteSubdiario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

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

    const { rows } = await pool.query(query, [fechaInicio || null, fechaFin || null]);
    res.status(200).json({ ok: true, data: rows });
  } catch (error) {
    console.error("❌ Error en reporte subdiario:", (error as Error).message);
    res.status(500).json({ error: "Error al obtener reporte subdiario" });
  }
};

import { Request, Response } from "express";
import { pool } from "../db/connection";

// Convierte cualquier valor a número seguro (0 si null, undefined, string vacío, NaN)
const safeNumber = (val: any) => Number(val) || 0;

export const getReporteMensual = async (req: Request, res: Response): Promise<void> => {
  try {
    let { fechaInicio, fechaFin } = req.query;
    // Si no se pasan fechas, usar el mes en curso
    if (!fechaInicio || !fechaFin) {
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

    const { rows } = await pool.query(queryTotales, [fechaInicio, fechaFin]);

    // Enviar los totales al frontend
    console.log('📤 Respuesta enviada:', rows);
    res.status(200).json({ ok: true, data: rows });
  } catch (error) {
    console.error("❌ Error al obtener reporte mensual:", (error as Error).message);
    res.status(500).json({ error: "Error al obtener reporte mensual" });
  }
};

