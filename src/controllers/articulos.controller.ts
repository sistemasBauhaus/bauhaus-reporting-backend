import { Request, Response } from 'express';
import { pool } from '../db/connection';
import { getCombustibles, Articulo } from '../api/caldenon.service';

export const guardarCombustibles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    const combustibles: Articulo[] = await getCombustibles(token);

    for (const item of combustibles) {
      await pool.query(
        `INSERT INTO articulos_combustibles (id_articulo, descripcion, es_combustible, es_lubricante, color)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id_articulo) DO NOTHING`,
        [item.id_articulo, item.descripcion, item.es_combustible, item.es_lubricante, item.color]
      );
    }

    res.json({ mensaje: 'Datos guardados correctamente', total: combustibles.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar los combustibles' });
  }
};
