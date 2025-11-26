// src/services/positions.service.ts
import fetch from "node-fetch";
import { pool } from "../db/connection";

const API_BASE_URL = process.env.API_BASE_URL_MAXTRACKER as string;
const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN_MAXTRACKER as string;

interface Position {
  lat: string;
  lng: string;
  date: string;
  speed: string;
  direction: string;
  event_code: string;
  event: string;
  plate: string;
  imei: string | null;
  odometer: number;
  hourmeter: number;
  driver_key: string | null;
  driver_name: string;
  driver_document: string;
}

interface PositionResponse {
  ok?: boolean;
  data?: Position[];
}

interface SyncResult {
  insertados: number;
  actualizados: number;
  total: number;
  errores: string[];
}

/**
 * Obtiene las posiciones de vehículos de la API de MaxTracker
 * @param placa - Placa del vehículo (opcional, si se omite obtiene todos)
 * @param limit - Límite de registros (default: 100)
 * @returns Array de posiciones de vehículos
 */
export async function obtenerPosiciones(placa?: string, limit: number = 100): Promise<Position[]> {
  try {
    let url = `${API_BASE_URL}/positions?limit=${limit}`;
    
    if (placa) {
      url += `&plate=${encodeURIComponent(placa)}`;
    }

    console.log(`🔍 Consultando API de posiciones: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${API_BEARER_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`❌ Error en API de posiciones: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = (await response.json()) as PositionResponse | Position[];

    // Manejar ambos formatos: array directo o objeto con {ok, data}
    let posiciones: Position[] = [];

    if (Array.isArray(data)) {
      // Si es un array directo
      posiciones = data;
    } else if (data && data.ok && data.data && Array.isArray(data.data)) {
      // Si es un objeto con estructura {ok, data}
      posiciones = data.data;
    }

    if (posiciones.length === 0) {
      console.warn("⚠️ API retornó data vacía");
      return [];
    }

    console.log(`✅ Se obtuvieron ${posiciones.length} posiciones`);
    return posiciones;
  } catch (error) {
    console.error("❌ Error al obtener posiciones:", (error as Error).message);
    return [];
  }
}

/**
 * Sincroniza las posiciones en la base de datos
 * @param placa - Placa del vehículo (opcional)
 * @returns Resultado de la sincronización
 */
export async function sincronizarPosiciones(placa?: string): Promise<SyncResult> {
  const resultado: SyncResult = {
    insertados: 0,
    actualizados: 0,
    total: 0,
    errores: [],
  };

  try {
    // Obtener posiciones de la API
    const posiciones = await obtenerPosiciones(placa);

    if (posiciones.length === 0) {
      console.log("ℹ️ No hay posiciones para sincronizar");
      return resultado;
    }

    resultado.total = posiciones.length;

    // Crear tabla si no existe
    await crearTablaPosiciones();

    // Sincronizar cada posición
    for (const pos of posiciones) {
      try {
        const fechaRegistro = parsearFechaAPI(pos.date);
        
        const query = `
          INSERT INTO positions (
            lat, lng, date, speed, direction, event_code, event,
            plate, imei, odometer, hourmeter, driver_key, driver_name,
            driver_document, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
          )
          ON CONFLICT (plate, date) 
          DO UPDATE SET
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            speed = EXCLUDED.speed,
            direction = EXCLUDED.direction,
            event_code = EXCLUDED.event_code,
            event = EXCLUDED.event,
            imei = EXCLUDED.imei,
            odometer = EXCLUDED.odometer,
            hourmeter = EXCLUDED.hourmeter,
            driver_key = EXCLUDED.driver_key,
            driver_name = EXCLUDED.driver_name,
            driver_document = EXCLUDED.driver_document,
            updated_at = NOW();
        `;

        const values = [
          parseFloat(pos.lat),
          parseFloat(pos.lng),
          fechaRegistro,
          parseFloat(pos.speed) || 0,
          parseFloat(pos.direction) || 0,
          pos.event_code,
          pos.event,
          pos.plate,
          pos.imei || null,
          parseInt(String(pos.odometer)) || 0,
          parseInt(String(pos.hourmeter)) || 0,
          pos.driver_key || null,
          pos.driver_name,
          pos.driver_document,
        ];

        const res = await pool.query(query, values);

        if (res.rowCount === 1) {
          // Verificar si fue INSERT o UPDATE
          const checkQuery = `SELECT COUNT(*) as count FROM positions WHERE plate = $1 AND date = $2`;
          const checkRes = await pool.query(checkQuery, [pos.plate, fechaRegistro]);
          
          // Si hay más de 1, fue un UPDATE
          if (checkRes.rows[0]?.count > 1) {
            resultado.actualizados++;
          } else {
            resultado.insertados++;
          }
        }
      } catch (error) {
        const errorMsg = `Error al sincronizar posición de ${pos.plate}: ${(error as Error).message}`;
        console.error(`❌ ${errorMsg}`);
        resultado.errores.push(errorMsg);
      }
    }

    console.log(`✅ Sincronización de posiciones completada`);
    console.log(`   - Insertados: ${resultado.insertados}`);
    console.log(`   - Actualizados: ${resultado.actualizados}`);
    console.log(`   - Errores: ${resultado.errores.length}`);

    return resultado;
  } catch (error) {
    console.error("❌ Error en sincronización de posiciones:", (error as Error).message);
    resultado.errores.push((error as Error).message);
    return resultado;
  }
}

/**
 * Crea la tabla de posiciones si no existe
 */
async function crearTablaPosiciones(): Promise<void> {
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        lat DECIMAL(10, 8) NOT NULL,
        lng DECIMAL(11, 8) NOT NULL,
        date TIMESTAMP NOT NULL,
        speed DECIMAL(5, 2) DEFAULT 0,
        direction DECIMAL(5, 2) DEFAULT 0,
        event_code VARCHAR(50),
        event VARCHAR(255),
        plate VARCHAR(20) NOT NULL,
        imei VARCHAR(50),
        odometer INT DEFAULT 0,
        hourmeter INT DEFAULT 0,
        driver_key VARCHAR(50),
        driver_name VARCHAR(255),
        driver_document VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_position UNIQUE(plate, date)
      );

      CREATE INDEX IF NOT EXISTS idx_positions_plate ON positions(plate);
      CREATE INDEX IF NOT EXISTS idx_positions_date ON positions(date);
      CREATE INDEX IF NOT EXISTS idx_positions_plate_date ON positions(plate, date);
    `;

    await pool.query(createTableQuery);
    console.log("✅ Tabla 'positions' verificada/creada");
  } catch (error) {
    console.error("❌ Error al crear tabla de posiciones:", (error as Error).message);
    throw error;
  }
}

/**
 * Parsea una fecha del formato de la API (YYYY-MM-DD HH:mm:ss)
 * @param fechaStr - String de fecha
 * @returns Date object
 */
function parsearFechaAPI(fechaStr: string): Date {
  if (!fechaStr || typeof fechaStr !== "string") {
    return new Date();
  }

  try {
    // Formato: "2025-11-26 12:26:56"
    const fecha = new Date(fechaStr);
    
    if (isNaN(fecha.getTime())) {
      console.warn(`⚠️ Fecha inválida: ${fechaStr}`);
      return new Date();
    }

    return fecha;
  } catch (error) {
    console.error(`❌ Error al parsear fecha ${fechaStr}:`, (error as Error).message);
    return new Date();
  }
}

/**
 * Obtiene la última posición de un vehículo
 * @param placa - Placa del vehículo
 * @returns Última posición del vehículo
 */
export async function obtenerUltimaPosicion(placa: string): Promise<Position | null> {
  try {
    const posiciones = await obtenerPosiciones(placa, 1);
    
    if (posiciones.length === 0) {
      return null;
    }

    return posiciones[0] || null;
  } catch (error) {
    console.error(`❌ Error al obtener última posición de ${placa}:`, (error as Error).message);
    return null;
  }
}

/**
 * Obtiene el historial de posiciones de un vehículo desde la base de datos
 * @param placa - Placa del vehículo
 * @param limit - Cantidad de registros a retornar (default: 50)
 * @returns Array de posiciones del vehículo
 */
export async function obtenerHistorialPosiciones(placa: string, limit: number = 50): Promise<Position[]> {
  try {
    const query = `
      SELECT 
        lat, lng, date, speed, direction, event_code, event,
        plate, imei, odometer, hourmeter, driver_key, driver_name, driver_document
      FROM positions
      WHERE plate = $1
      ORDER BY date DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [placa, limit]);

    return result.rows as Position[];
  } catch (error) {
    console.error(`❌ Error al obtener historial de ${placa}:`, (error as Error).message);
    return [];
  }
}
