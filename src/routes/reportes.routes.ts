import express from "express";
import { 
  getReporteMensual, 
  getReporteSubdiario, 
  getReporteUnidadesEmpresa,
  getFacturacionDiariaCliente,
  getFacturacionDiariaGNC,
  getFacturacionDiariaLiquidos,
  getFacturacionDiariaOtros,
  getFacturacionDiariaShop,
  getReciboDiarioCliente
} from "../controllers/reportes.controller";

const router = express.Router();

console.log("🔍 [DEBUG] ========================================");
console.log("🔍 [DEBUG] MÓDULO DE RUTAS DE REPORTES CARGADO");
console.log("🔍 [DEBUG] ========================================");

// Middleware de logging para todas las rutas de reportes
router.use((req, res, next) => {
  console.log("🔍 [DEBUG] ========================================");
  console.log("🔍 [DEBUG] ⚠️ PETICIÓN RECIBIDA EN RUTAS DE REPORTES ⚠️");
  console.log("🔍 [DEBUG] Método:", req.method);
  console.log("🔍 [DEBUG] URL:", req.url);
  console.log("🔍 [DEBUG] Path:", req.path);
  console.log("🔍 [DEBUG] Query params:", req.query);
  console.log("🔍 [DEBUG] ========================================");
  next();
});

router.get("/reportes/subdiario", (req, res, next) => {
  console.log("🔍 [DEBUG] ⚠️ RUTA /reportes/subdiario MATCHED ⚠️");
  next();
}, getReporteSubdiario);

router.get("/reportes/mensual", (req, res, next) => {
  console.log("🔍 [DEBUG] ⚠️ RUTA /reportes/mensual MATCHED ⚠️");
  next();
}, getReporteMensual);

// Ruta genérica que maneja el parámetro tipo
router.get("/reportes", (req, res, next) => {
  console.log("🔍 [DEBUG] ⚠️ RUTA /reportes MATCHED ⚠️");
  console.log("🔍 [DEBUG] Parámetro tipo recibido:", req.query.tipo);
  
  const { tipo } = req.query;
  
  if (tipo === "unidades-empresa") {
    console.log("🔍 [DEBUG] Redirigiendo a getReporteUnidadesEmpresa");
    return getReporteUnidadesEmpresa(req, res);
  }
  
  // Si no hay tipo o tipo no reconocido, devolver error
  res.status(400).json({ 
    error: "Parámetro 'tipo' requerido o no válido",
    tipos_disponibles: ["unidades-empresa"],
    ejemplo: "/api/reportes?tipo=unidades-empresa&fechaInicio=2023-01-01&fechaFin=2023-01-31"
  });
});

// Endpoints para vistas de facturación y recibos diarios
router.get("/reportes/facturacion-diaria-cliente", getFacturacionDiariaCliente);
router.get("/reportes/facturacion-diaria-gnc", getFacturacionDiariaGNC);
router.get("/reportes/facturacion-diaria-liquidos", getFacturacionDiariaLiquidos);
router.get("/reportes/facturacion-diaria-otros", getFacturacionDiariaOtros);
router.get("/reportes/facturacion-diaria-shop", getFacturacionDiariaShop);
router.get("/reportes/recibo-diario-cliente", getReciboDiarioCliente);

// Ruta de prueba para verificar que el router funciona
router.get("/reportes/test", (req, res) => {
  console.log("🔍 [DEBUG] ⚠️ RUTA DE TEST /reportes/test ACCEDIDA ⚠️");
  res.json({ ok: true, message: "Rutas de reportes funcionando correctamente" });
});

console.log("✅ [DEBUG] Rutas de reportes registradas:");
console.log("   - GET /api/reportes/subdiario");
console.log("   - GET /api/reportes/mensual");
console.log("   - GET /api/reportes?tipo=unidades-empresa");
console.log("   - GET /api/reportes/test (ruta de prueba)");
console.log("   - GET /api/reportes/facturacion-diaria-cliente");
console.log("   - GET /api/reportes/facturacion-diaria-gnc");
console.log("   - GET /api/reportes/facturacion-diaria-liquidos");
console.log("   - GET /api/reportes/facturacion-diaria-otros");
console.log("   - GET /api/reportes/facturacion-diaria-shop");
console.log("   - GET /api/reportes/recibo-diario-cliente");

export default router;
