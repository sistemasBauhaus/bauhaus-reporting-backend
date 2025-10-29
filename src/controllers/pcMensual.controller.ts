import { Request, Response } from "express";
import { pool } from "../db/connection";

export const getPcMensual = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📅 Filtro recibido:", req.query); 


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
      console.log(`📅 No se pasaron fechas, usando mes en curso: ${fechaInicio} a ${fechaFin}`);
    } else {
      console.log(`📅 Fechas recibidas: ${fechaInicio} a ${fechaFin}`);
    }

    // Si consumes una API externa aquí, puedes agregar un log:
    // console.log('🌐 Consultando API externa...');

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
      WHERE m.fecha >= $1::date AND m.fecha <= $2::date
      GROUP BY m.fecha::date, d.nombre, d.categoria
      ORDER BY m.fecha::date, d.categoria, d.nombre;
      `,
      [fechaInicio, fechaFin]
    );

    const responseData = rows.map((row: any) => ({
      ...row,
      total_importe: String(row.total_importe),
      total_cantidad: String(row.total_cantidad),
    }));
    console.log("➡️ Respuesta enviada PC Mensual:", responseData);
    res.status(200).json(responseData);
  } catch (error) {
    console.error("❌ Error al obtener PC Mensual:", (error as Error).message);
    res.status(500).json({ error: "Error al obtener PC Mensual" });
  }
};
