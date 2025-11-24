import { Router } from "express";
import { getRecibosEntreFechas } from "../controllers/ctacte.controller";

const router = Router();

router.get("/CtaCte/GetRecibosEntreFechas", getRecibosEntreFechas);

export default router;

