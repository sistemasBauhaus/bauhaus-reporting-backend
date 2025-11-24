import { Router } from "express";
import { getFacturasVenta } from "../controllers/facturacion.controller";

const router = Router();

router.get("/Facturacion/GetFacturasVenta", getFacturasVenta);

export default router;

