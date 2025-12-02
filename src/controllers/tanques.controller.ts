// ...eliminado endpoint combinado...
import { Request, Response } from "express";
import axios from 'axios';

// Devuelve los niveles actuales de todos los tanques (solo API externa)
export const getNivelesTanques = async (req: Request, res: Response) => {
  try {
    const tanquesRes = await axios.get(`${process.env.API_BASE_URL}/Tanques/GetAllTanques`, {
      headers: { Authorization: `Bearer ${process.env.API_TOKEN}` }
    });
    const tanques = tanquesRes.data;

    const PRODUCTOS_VALIDOS = [
      'NAFTA SUPER',
      'QUANTIUM NAFTA',
      'DIESEL X10',
      'QUANTIUM DIESEL'
    ];

    const tanquesFiltrados = tanques.filter((tanque: any) => 
      PRODUCTOS_VALIDOS.includes(tanque.articulo?.descripcion?.toUpperCase() || '')
    );

    const resultados = [];
    for (const tanque of tanquesFiltrados) {
      const infoRes = await axios.get(`${process.env.API_BASE_URL}/Tanques/GetInformacionActualTanque`, {
        headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
        params: { idTanque: tanque.idTanque }
      });
      const info = infoRes.data;
      resultados.push({
        id_tanque: tanque.idTanque,
        producto: tanque.articulo.descripcion,
        capacidad: (info.litros ?? 0) + (info.litrosVacio ?? 0),
        nivel_actual: info.litros ?? 0,
        temperatura: info.temperatura ?? null,
        fecha_actualizacion: info.fechaHoraMedicion
      });
    }

    console.log("🔹 Respuesta niveles tanques:", resultados);
    res.json(resultados);
  } catch (error) {
    res.status(500).json({ error: 'Error consultando la API externa', detalle: (error as Error).message });
  }
};



