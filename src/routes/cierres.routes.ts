import { Router } from "express";
import { syncCierresToDB, syncCierresToDBAuto, getMediosPagoByCierre } from "../controllers/cierres.controller";

const router = Router();

// router.get("/cierres", descargarCierres);
// router.get("/cierres/detalle", obtenerDetalleCierre);
router.post("/cierres/sync", syncCierresToDB); 
router.post("/cierres/sync-auto", syncCierresToDBAuto);
router.get("/cierres/:idCierreTurno/medios-pago", getMediosPagoByCierre);

export default router;
