import express from "express";
import { getReporteMensual, getReporteSubdiario } from "../controllers/reportes.controller";

const router = express.Router();


router.get("/reportes/subdiario", getReporteSubdiario);

export default router;
