import { Router } from "express";
import { getNivelesTanques } from "../controllers/tanques.controller";

const router = Router();


// Ruta para obtener los niveles actuales de todos los tanques (API externa)
router.get("/niveles", getNivelesTanques);

export default router;
