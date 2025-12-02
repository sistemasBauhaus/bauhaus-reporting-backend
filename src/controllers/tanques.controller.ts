// Devuelve la información histórica de un tanque para todos los días de un mes
export const getHistoricoTanquePorMes = async (req: Request, res: Response) => {
  const { idTanque, mes, anio } = req.query;
  if (!idTanque || !mes || !anio) {
    return res.status(400).json({ error: "Faltan parámetros idTanque, mes o anio" });
  }
  // Calcular días del mes
  const year = parseInt(anio as string, 10);
  const month = parseInt(mes as string, 10); // 1-12
  const daysInMonth = new Date(year, month, 0).getDate();
  const fechas = Array.from({ length: daysInMonth }, (_, i) => {
    const day = (i + 1).toString().padStart(2, '0');
    return `${year}-${month.toString().padStart(2, '0')}-${day}`;
  });
  const PRODUCTOS_VALIDOS = [
    'NAFTA SUPER',
    'SUPER',
    'QUANTIUM NAFTA',
    'DIESEL X10',
    'QUANTIUM DIESEL'
  ];
  const resultados: any[] = [];
  for (const fecha of fechas) {
    try {
      const response = await axios.get(`${process.env.API_BASE_URL}/Tanques/GetInformacionHistoricaTanque`, {
        headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
        params: { idTanque, fecha }
      });
      const data = response.data;
      if (data && PRODUCTOS_VALIDOS.includes((data.Producto ?? '').toUpperCase())) {
        resultados.push(data);
      }
    } catch (error) {
      // Si falla un día, lo omite
      console.error(`❌ [ERROR] Histórico tanque ${idTanque} fecha ${fecha}:`, (error as Error).message);
    }
  }
  res.json(resultados);
};
// Devuelve la información histórica de un tanque en una fecha específica (solo productos válidos)
export const getInformacionHistoricaTanque = async (req: Request, res: Response) => {
  const { idTanque, fecha } = req.query;
  if (!idTanque || !fecha) {
    return res.status(400).json({ error: "Faltan parámetros idTanque o fecha" });
  }
  try {
    const response = await axios.get(`${process.env.API_BASE_URL}/Tanques/GetInformacionHistoricaTanque`, {
      headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
      params: { idTanque, fecha }
    });
    const data = response.data;
    console.log("🔍 [DEBUG] Respuesta API externa (histórico):", data);
    // Filtrar por producto válido
    const PRODUCTOS_VALIDOS = [
      'NAFTA SUPER',
      'SUPER',
      'QUANTIUM NAFTA',
      'DIESEL X10',
      'QUANTIUM DIESEL'
    ];
    if (data && PRODUCTOS_VALIDOS.includes((data.Producto ?? '').toUpperCase())) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Producto no válido o no encontrado para ese tanque en esa fecha' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error consultando la API externa', detalle: (error as Error).message });
  }
};
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
        'SUPER',
        'QUANTIUM NAFTA',
        'DIESEL X10',
        'QUANTIUM DIESEL'
      ];
    

    const tanquesFiltrados = tanques.filter((tanque: any) => 
      PRODUCTOS_VALIDOS.includes(tanque.articulo?.descripcion?.toUpperCase() || '')
    );
    console.log("🔍 [DEBUG] Tanques filtrados:", tanquesFiltrados.map((t: any) => ({ id: t.idTanque, producto: t.articulo.descripcion })));

    const resultados = [];
    for (const tanque of tanquesFiltrados) {
      try {
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
      } catch (err) {
        console.error(`❌ [ERROR] Tanque ${tanque.idTanque} (${tanque.articulo.descripcion}):`, (err as Error).message);
      }
    }

    console.log("🔹 Respuesta niveles tanques:", resultados);
    res.json(resultados);
  } catch (error) {
    res.status(500).json({ error: 'Error consultando la API externa', detalle: (error as Error).message });
  }
};



