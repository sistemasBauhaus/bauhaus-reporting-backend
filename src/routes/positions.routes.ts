// src/routes/positions.routes.ts
import { Router } from "express";
import {
  getPosiciones,
  getUltimaPosicion,
  getHistorialPosiciones,
  sincronizar,
} from "../controllers/positions.controller";

const router = Router();

/**
 * GET /api/positions
 * Obtiene posiciones de vehículos
 * Query: ?plate=AD776WH&limit=100
 */
router.get("/", getPosiciones);

/**
 * GET /api/positions/ultima-posicion/:placa
 * Obtiene la última posición de un vehículo
 */
router.get("/ultima-posicion/:placa", getUltimaPosicion);

/**
 * GET /api/positions/historial/:placa
 * Obtiene el historial de posiciones de un vehículo
 * Query: ?limit=50
 */
router.get("/historial/:placa", getHistorialPosiciones);

/**
 * POST /api/positions/sincronizar
 * Sincroniza las posiciones en la base de datos
 * Body: { plate?: "AD776WH" }
 */
router.post("/sincronizar", sincronizar);

export default router;
