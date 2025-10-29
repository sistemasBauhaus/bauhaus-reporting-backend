import { Router } from "express";
import { descargarCierres, obtenerDetalleCierre, syncCierresToDB, syncCierresToDBAuto } from "../controllers/cierres.controller";

const router = Router();

router.get("/cierres", descargarCierres);
router.get("/cierres/detalle", obtenerDetalleCierre);
router.post("/cierres/sync", syncCierresToDB); 
router.post("/cierres/sync-auto", syncCierresToDBAuto);

export default router;
