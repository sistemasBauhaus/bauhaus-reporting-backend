import { Router } from "express";
import { syncCierresToDB } from "../controllers/cierres.controller";

const router = Router();


router.get("/cierres/sync", syncCierresToDB); // Permite GET con parámetros de fecha
router.post("/cierres/sync", syncCierresToDB); // Mantiene POST para compatibilidad

export default router;
