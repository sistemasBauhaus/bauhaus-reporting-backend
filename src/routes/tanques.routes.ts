import { Router } from "express";
import { getNivelesTanques, getInformacionHistoricaTanque, getHistoricoTanquePorMes } from "../controllers/tanques.controller";

const router = Router();


// Ruta para obtener los niveles actuales de todos los tanques (API externa)
router.get("/niveles", getNivelesTanques);

// Ruta para obtener la información histórica de un tanque por fecha
router.get("/historico", getInformacionHistoricaTanque);

// Ruta para obtener la información histórica de un tanque por mes
router.get("/historico-mes", getHistoricoTanquePorMes);

export default router;
