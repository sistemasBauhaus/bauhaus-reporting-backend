import { Router } from "express";
import { descargarCierres, obtenerDetalleCierre, syncCierresToDB } from "../controllers/cierres.controller";

const router = Router();

router.get("/cierres", descargarCierres);
router.get("/cierres/detalle", obtenerDetalleCierre);
router.post("/cierres/sync", syncCierresToDB); 

export default router;
