// Subdiario: una fila por día, columnas fijas por producto/categoría
export const getReporteSubdiario = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    const query = `
      SELECT
        m.fecha::date,
        d.categoria,
        d.nombre,
        SUM(m.cantidad) AS litros,
        SUM(m.importe) AS importe
      FROM datos_metricas m
      JOIN dim_producto d USING (producto_id)
      WHERE ($1::date IS NULL OR m.fecha >= $1::date)
        AND ($2::date IS NULL OR m.fecha <= $2::date)
      GROUP BY m.fecha::date, d.categoria, d.nombre
      ORDER BY m.fecha::date, d.categoria;
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

    const query = `
      SELECT
        m.fecha::date AS fecha,
        CASE
          WHEN d.nombre ILIKE '%nafta%' OR d.nombre ILIKE '%quantium%' OR d.nombre ILIKE '%diesel%' THEN 'liquidos'
          WHEN d.nombre ILIKE '%gnc%' THEN 'gnc'
          WHEN d.nombre ILIKE '%lubricante%' THEN 'lubricantes'
          WHEN d.nombre ILIKE '%adblue%' THEN 'adblue'
          WHEN d.categoria ILIKE '%shop%' THEN 'shop'
          ELSE 'otros'
        END AS grupo,
        SUM(m.importe) AS importe
      FROM datos_metricas m
      JOIN dim_producto d ON m.producto_id = d.producto_id
      WHERE m.fecha >= $1 AND m.fecha <= $2
      GROUP BY m.fecha::date, grupo
      ORDER BY m.fecha::date;
    `;

    const { rows } = await pool.query(query, [fechaInicio, fechaFin]);

    console.log('🔎 Filas SQL:', rows);

    // Pivotear resultados
    const reporte: Record<string, any> = {};
    for (const row of rows) {
      const fecha = row.fecha instanceof Date ? row.fecha.toISOString().split("T")[0] : String(row.fecha);
      if (!reporte[fecha]) reporte[fecha] = { fecha };
      reporte[fecha][`${row.grupo}_importe`] = Number(row.importe);
    }

    // Calcular totales
    const data = Object.values(reporte).map((fila: any) => ({
      ...fila,
      total:
        (fila.liquidos_importe || 0) +
        (fila.gnc_importe || 0) +
        (fila.lubricantes_importe || 0) +
        (fila.adblue_importe || 0) +
        (fila.shop_importe || 0),
    }));

    console.log('📤 Respuesta enviada:', data);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error("❌ Error al obtener reporte mensual:", (error as Error).message);
    res.status(500).json({ error: "Error al obtener reporte mensual" });
  }
};

