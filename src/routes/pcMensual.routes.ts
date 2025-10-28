// backend/src/routes/pcMensual.routes.ts
import express from "express";
import { getPcMensual} from "../controllers/pcMensual.controller";

const router = express.Router();

router.get("/pcMensual", getPcMensual);

export default router;
