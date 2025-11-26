// src/jobs/syncFacturacionJob.ts
import cron from "node-cron";
import { sincronizarFacturas } from "../services/facturas.service";
import { sincronizarRecibos } from "../services/recibos.service";

/**
 * Cron job que se ejecuta cada hora para sincronizar facturas y recibos
 * Programación: cada hora (0 * * * * = a las 0 de cada hora)
 * Sincroniza la última hora de datos
 */
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Cron de facturación ejecutado:", new Date().toISOString());

  // Obtener la última hora
  const ahora = new Date();
  const hace1Hora = new Date(ahora);
  hace1Hora.setHours(hace1Hora.getHours() - 1);
  
  // Construir las fechas
  const fechaInicio = hace1Hora.toISOString().split(".")[0] + ".000Z";
  const fechaFin = ahora.toISOString().split(".")[0] + ".999Z";

  try {
    console.log(`📥 Sincronizando última hora`);
    console.log(`📅 Rango: ${fechaInicio} a ${fechaFin}`);

    // Ejecutar ambas sincronizaciones en paralelo
    const [resultFacturas, resultRecibos] = await Promise.all([
      sincronizarFacturas(fechaInicio, fechaFin),
      sincronizarRecibos(fechaInicio, fechaFin),
    ]);

    console.log("✅ Sincronización automática completada");
    console.log(`   - Facturas: ${resultFacturas.insertados} nuevas, ${resultFacturas.actualizados} actualizadas`);
    console.log(`   - Recibos: ${resultRecibos.insertados} nuevos, ${resultRecibos.actualizados} actualizados`);
  } catch (error) {
    console.error("❌ Error en cron de facturación:", (error as Error).message);
  }
});

console.log("✅ Cron jobs de facturación configurados:");
console.log("   - Cada hora: sincronización última hora");

/**
 * Función auxiliar para probar la sincronización sin esperar una hora
 * Llamar manualmente en tests o endpoints de prueba
 * Ej: POST /api/test/sync-manual
 */
export async function sincronizacionManual() {
  console.log("🔄 Ejecutando sincronización manual...", new Date().toISOString());

  // Usar ayer (día cerrado) en lugar de hoy
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const fechaAyer = (ayer.toISOString().split("T")[0] || new Date().toISOString().split("T")[0]) as string;

  try {
    console.log(`📥 Sincronizando día cerrado: ${fechaAyer}`);

    const [resultFacturas, resultRecibos] = await Promise.all([
      sincronizarFacturas(fechaAyer, fechaAyer),
      sincronizarRecibos(fechaAyer, fechaAyer),
    ]);

    console.log("✅ Sincronización manual completada");
    console.log(`   - Facturas: ${resultFacturas.insertados} nuevas, ${resultFacturas.actualizados} actualizadas`);
    console.log(`   - Recibos: ${resultRecibos.insertados} nuevos, ${resultRecibos.actualizados} actualizados`);
    
    return {
      ok: true,
      message: "Sincronización completada",
      data: { resultFacturas, resultRecibos },
    };
  } catch (error) {
    console.error("❌ Error en sincronización manual:", (error as Error).message);
    throw error;
  }
}