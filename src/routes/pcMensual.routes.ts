import express from "express";
import { getPcMensual, getPcResumenMensual } from "../controllers/pcMensual.controller";

const router = express.Router();

router.get("/pcMensual", getPcMensual);
router.get("/pcMensual/resumen", getPcResumenMensual);

export default router;
