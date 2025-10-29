import { Request, Response } from "express";
import { pool } from "../db/connection";

export const getReporteMensual = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = `
      SELECT
        m.fecha::date AS fecha,
        CASE
          WHEN d.nombre ILIKE '%nafta%' OR d.nombre ILIKE '%quantium%' OR d.nombre ILIKE '%diesel%' THEN 'Líquidos'
          WHEN d.nombre ILIKE '%gnc%' THEN 'GNC'
          WHEN d.nombre ILIKE '%lubricante%' THEN 'Lubricantes'
          WHEN d.nombre ILIKE '%adblue%' THEN 'AdBlue'
          WHEN d.categoria ILIKE '%shop%' THEN 'Shop'
          ELSE 'Otros'
        END AS grupo,
        SUM(m.cantidad) AS litros,
        SUM(m.importe) AS importe
      FROM datos_metricas m
      JOIN dim_producto d ON m.producto_id = d.producto_id
      WHERE date_trunc('month', m.fecha) = date_trunc('month', current_date)
      GROUP BY m.fecha::date, grupo
      ORDER BY m.fecha::date, grupo;
    `;

    const { rows } = await pool.query(query);
    // Formatear fecha a YYYY-MM-DD (Argentina)
    const data = rows.map((row: any) => ({
      ...row,
      fecha: new Date(row.fecha).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
    }));
    res.status(200).json({ ok: true, cantidad: data.length, data });
  } catch (error) {
    console.error("❌ Error al obtener el reporte mensual:", (error as Error).message);
    res.status(500).json({ error: "Error al obtener el reporte mensual" });
  }
};
