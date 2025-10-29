import express from "express";
import { getReporteMensual } from "../controllers/reportes.controller";

const router = express.Router();

router.get("/reportes/mensual", getReporteMensual);

export default router;
