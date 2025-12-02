import axios from 'axios';
import dotenv from 'dotenv';
import { pool } from '../src/db/connection';

dotenv.config();

const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

// Productos que queremos filtrar
const PRODUCTOS_VALIDOS = [
  'NAFTA SUPER',
  'QUANTIUM NAFTA',
  'DIESEL X10',
  'QUANTIUM DIESEL'
];

async function actualizarTanques() {
  console.log(`[${new Date().toISOString()}] Iniciando actualización de tanques...`);
  try {
    console.log(`[${new Date().toISOString()}] Iniciando actualización de tanques...`);

    // 1. Obtener todos los tanques
    const tanquesRes = await axios.get<any[]>(`${BASE_URL}/Tanques/GetAllTanques`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    const tanques: any[] = tanquesRes.data;

    // 2. Filtrar tanques por producto
    const tanquesFiltrados = tanques.filter((tanque) => {
      const descripcion = tanque.articulo?.descripcion?.toUpperCase() || '';
      return PRODUCTOS_VALIDOS.includes(descripcion);
    });

    for (const tanque of tanquesFiltrados) {
      // 3. Obtener información actual del tanque
      const infoRes = await axios.get<any>(`${BASE_URL}/Tanques/GetInformacionActualTanque`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { idTanque: tanque.idTanque }
      });
      const info: any = infoRes.data;

      // 4. Preparar datos para guardar
      const idTanque = tanque.idTanque;
      const producto = tanque.articulo.descripcion;
      const capacidad = (info.litros ?? 0) + (info.litrosVacio ?? 0);
      const nivel_actual = info.litros ?? 0;
      const temperatura = info.temperatura ?? null;
      // Usar la fecha de la medición de la API externa
      const fecha_actualizacion = info.fechaHoraMedicion ? new Date(info.fechaHoraMedicion) : new Date();

      // Insertar o actualizar SIEMPRE con la última medición
      await pool.query(`
        INSERT INTO tanques_estado_actual (id_tanque, producto, capacidad, nivel_actual, temperatura, fecha_actualizacion)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id_tanque)
        DO UPDATE SET
          producto = EXCLUDED.producto,
          capacidad = EXCLUDED.capacidad,
          nivel_actual = EXCLUDED.nivel_actual,
          temperatura = EXCLUDED.temperatura,
          fecha_actualizacion = EXCLUDED.fecha_actualizacion;
      `, [idTanque, producto, capacidad, nivel_actual, temperatura, fecha_actualizacion]);

      console.log(`[${new Date().toISOString()}] Tanque actualizado: ${producto} (ID: ${idTanque}) | Nivel: ${nivel_actual} | Capacidad: ${capacidad} | Temp: ${temperatura} | Fecha medición: ${fecha_actualizacion.toISOString()}`);
    }

    console.log('✅ Actualización de tanques completada.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error actualizando tanques:', error);
    process.exit(1);
  }
}

actualizarTanques();
