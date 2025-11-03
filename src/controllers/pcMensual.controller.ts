import { Request, Response } from "express";
import { pool } from "../db/connection";

export const getPcMensual = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📅 Filtro recibido:", req.query);

    let { fechaInicio, fechaFin } = req.query;

    // Si no se pasan fechas, usar el mes actual
    if (!fechaInicio || !fechaFin) {
      const now = new Date();
      const primerDiaMes = new Date(now.getFullYear(), now.getMonth(), 1);
      fechaInicio = primerDiaMes.toISOString().split("T")[0];
      fechaFin = now.toISOString().split("T")[0];
      console.log(`📅 No se pasaron fechas, usando mes actual: ${fechaInicio} a ${fechaFin}`);
    } else {
      console.log(`📅 Fechas recibidas: ${fechaInicio} a ${fechaFin}`);
    }


    const { rows } = await pool.query(
      `
      SELECT 
        m.fecha::date AS fecha,
        m.estacion_id,
        m.nombre_estacion,
        m.caja_id,
        m.nombre_caja,
        p.nombre AS producto,
        p.categoria AS categoria,
        SUM(m.importe) AS total_importe,
        SUM(m.cantidad) AS total_cantidad
      FROM datos_metricas m
      JOIN departamentos d ON m.depto_id = d.depto_id
      JOIN dim_producto p ON m.producto_id = p.producto_id
      WHERE m.fecha BETWEEN $1::date AND $2::date
      GROUP BY m.fecha::date, m.estacion_id, m.nombre_estacion, m.caja_id, m.nombre_caja, p.nombre, p.categoria
      ORDER BY m.fecha::date DESC;
      `,
      [fechaInicio, fechaFin]
    );

    const data = rows.map((r: any) => ({
      fecha: r.fecha,
      estacion_id: r.estacion_id,
      nombre_estacion: r.nombre_estacion,
      caja_id: r.caja_id,
      nombre_caja: r.nombre_caja,
      categoria: r.categoria,
      producto: r.producto,
      total_importe: Number(r.total_importe),
      total_cantidad: Number(r.total_cantidad),
    }));

    console.log("➡️ Respuesta enviada PC Mensual:", data);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    console.error("❌ Error al obtener PC Mensual:", (error as Error).message);
    res.status(500).json({ ok: false, error: "Error al obtener PC Mensual" });
  }
};

