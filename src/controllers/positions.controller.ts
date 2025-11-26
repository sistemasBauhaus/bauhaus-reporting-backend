// src/controllers/positions.controller.ts
import { Request, Response } from "express";
import {
  obtenerPosiciones,
  sincronizarPosiciones,
  obtenerUltimaPosicion,
  obtenerHistorialPosiciones,
} from "../services/positions.service";

/**
 * GET /api/positions
 * Obtiene posiciones de vehículos (todas o filtradas por placa)
 * Query params:
 *   - plate: placa del vehículo (opcional)
 *   - limit: cantidad de registros (default: 100)
 */
export async function getPosiciones(req: Request, res: Response) {
  try {
    const { plate, limit } = req.query;
    const limitNum = limit ? parseInt(limit as string, 10) : 100;

    const posiciones = await obtenerPosiciones(
      plate ? (plate as string) : undefined,
      limitNum
    );

    res.json({
      ok: true,
      data: posiciones,
      count: posiciones.length,
    });
  } catch (error) {
    console.error("❌ Error en getPosiciones:", (error as Error).message);
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
    });
  }
}

/**
 * GET /api/positions/ultima-posicion/:placa
 * Obtiene la última posición de un vehículo
 */
export async function getUltimaPosicion(req: Request, res: Response) {
  try {
    const { placa } = req.params;

    if (!placa) {
      return res.status(400).json({
        ok: false,
        error: "La placa es requerida",
      });
    }

    const posicion = await obtenerUltimaPosicion(placa);

    if (!posicion) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron posiciones para este vehículo",
      });
    }

    res.json({
      ok: true,
      data: posicion,
    });
  } catch (error) {
    console.error("❌ Error en getUltimaPosicion:", (error as Error).message);
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
    });
  }
}

/**
 * GET /api/positions/historial/:placa
 * Obtiene el historial de posiciones de un vehículo
 * Query params:
 *   - limit: cantidad de registros (default: 50)
 */
export async function getHistorialPosiciones(req: Request, res: Response) {
  try {
    const { placa } = req.params;
    const { limit } = req.query;
    const limitNum = limit ? parseInt(limit as string, 10) : 50;

    if (!placa) {
      return res.status(400).json({
        ok: false,
        error: "La placa es requerida",
      });
    }

    const historial = await obtenerHistorialPosiciones(placa, limitNum);

    res.json({
      ok: true,
      data: historial,
      count: historial.length,
    });
  } catch (error) {
    console.error("❌ Error en getHistorialPosiciones:", (error as Error).message);
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
    });
  }
}

/**
 * POST /api/positions/sincronizar
 * Sincroniza las posiciones en la base de datos
 * Body (opcional):
 *   - plate: placa del vehículo (opcional, si se omite sincroniza todos)
 */
export async function sincronizar(req: Request, res: Response) {
  try {
    const { plate } = req.body;

    console.log(
      `🔄 Iniciando sincronización de posiciones${plate ? ` (${plate})` : " (todos)"}`
    );

    const resultado = await sincronizarPosiciones(plate);

    res.json({
      ok: true,
      message: "Sincronización completada",
      data: resultado,
    });
  } catch (error) {
    console.error("❌ Error en sincronizar:", (error as Error).message);
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
    });
  }
}
