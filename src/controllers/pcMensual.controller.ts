import { Request, Response } from "express";
import { pool } from "../db/connection";

export const getPcMensual = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📅 Filtro recibido:", req.query); 

    const { fechaInicio, fechaFin } = req.query;

    const { rows } = await pool.query(
      `
      SELECT 
        m.fecha::date AS fecha,
        d.nombre AS producto,
        d.categoria,
        SUM(m.importe) AS total_importe,
        SUM(m.cantidad) AS total_cantidad
      FROM datos_metricas m
      JOIN dim_producto d ON m.producto_id = d.producto_id
      WHERE ($1::date IS NULL OR m.fecha >= $1::date)
        AND ($2::date IS NULL OR m.fecha <= $2::date)
      GROUP BY m.fecha::date, d.nombre, d.categoria
      ORDER BY m.fecha::date, d.categoria, d.nombre;
      `,
      [fechaInicio || null, fechaFin || null]
    );

    res.status(200).json(rows);
  } catch (error) {
    console.error("❌ Error al obtener PC Mensual:", (error as Error).message);
    res.status(500).json({ error: "Error al obtener PC Mensual" });
  }
};
