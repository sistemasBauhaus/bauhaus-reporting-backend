// src/routes/facturas.routes.ts
import { Router } from "express";
import {
  syncFacturas,
  syncRecibos,
  syncFacturacionCompleta,
  syncHistoria,
  getLogs,
} from "../controllers/facturas.controller";
import { sincronizacionManual } from "../jobs/syncFacturacionJob";
import { sincronizarFacturas } from "../services/facturas.service";
import { sincronizarRecibos } from "../services/recibos.service";
import { Request, Response } from "express";

const router = Router();

// Sincronización de facturas
router.get("/facturas/sync", syncFacturas);
router.post("/facturas/sync", syncFacturas);

// Sincronización de recibos
router.get("/recibos/sync", syncRecibos);
router.post("/recibos/sync", syncRecibos);

// Sincronización completa (facturas + recibos)
router.post("/sync-facturacion", syncFacturacionCompleta);
router.get("/sync-facturacion", syncFacturacionCompleta);

// Descarga de historia completa desde 2020
router.post("/sync-historia", syncHistoria);

// Obtener logs de sincronización
router.get("/logs-facturacion", getLogs);

/**
 * Endpoint de prueba: Ejecutar sincronización manual sin esperar a la próxima hora
 * POST /api/test-sync?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD
 * Soporta: YYYY-MM-DD o ISO format (2025-11-24T00:00:00.000Z)
 */
router.post("/test-sync", async (req: Request, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    // Si se proporcionan fechas, usarlas; sino usar ayer (día cerrado)
    let inicio = fechaInicio as string;
    let fin = fechaFin as string;

    if (!inicio || !fin) {
      const ayer = new Date();
      ayer.setDate(ayer.getDate() - 1);
      const defaultFecha = ayer.toISOString().split("T")[0] || "";
      inicio = inicio || defaultFecha;
      fin = fin || defaultFecha;
      console.log(`📅 No se proporcionaron fechas, usando día cerrado: ${inicio}`);
    }

    console.log(`🔄 Ejecutando sincronización manual: ${inicio} a ${fin}`);

    const [resultFacturas, resultRecibos] = await Promise.all([
      sincronizarFacturas(inicio, fin),
      sincronizarRecibos(inicio, fin),
    ]);

    res.status(200).json({
      ok: true,
      message: "✅ Sincronización manual ejecutada",
      fechas: { inicio, fin },
      data: {
        facturas: resultFacturas,
        recibos: resultRecibos,
      },
    });
  } catch (error) {
    console.error("❌ Error en test-sync:", (error as Error).message);
    res.status(500).json({
      ok: false,
      error: "Error en sincronización manual",
      message: (error as Error).message,
    });
  }
});

export default router;