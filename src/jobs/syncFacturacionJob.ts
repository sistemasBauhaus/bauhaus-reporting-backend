import { sincronizarFacturas } from "../services/facturas.service";
import { sincronizarRecibos } from "../services/recibos.service";
import cron from "node-cron";

function obtenerFechaArgentinaAPI(): string {
  const ahora = new Date();
  ahora.setHours(ahora.getHours() - 3);

  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const YYYY = ahora.getFullYear();
  const MM = pad(ahora.getMonth() + 1);
  const DD = pad(ahora.getDate());
  
  // YYYY-MM-DD
  return `${YYYY}-${MM}-${DD}`;
}

// Se ejecuta en el minuto 5 de cada hora
cron.schedule("5 * * * *", async () => {
  // Calcular la fecha basándonos en la hora argentina
  const fechaHoy = obtenerFechaArgentinaAPI();
  
  console.log("Cron de facturación iniciado:", new Date().toISOString());
  console.log(`Sincronizando día completo (Hora ARG): ${fechaHoy}`);

  try {
    // Ejecutar ambas sincronizaciones en paralelo
    const [resultFacturas, resultRecibos] = await Promise.all([
      sincronizarFacturas(fechaHoy, fechaHoy),
      sincronizarRecibos(fechaHoy, fechaHoy),
    ]);

    console.log("Sincronización completada");
    console.log(`   - Facturas: ${resultFacturas.insertados} nuevas, ${resultFacturas.actualizados} actualizadas`);
    console.log(`   - Recibos: ${resultRecibos.insertados} nuevos, ${resultRecibos.actualizados} actualizados`);
  } catch (error) {
    console.error("Error en cron de facturación:", (error as Error).message);
  }
});

console.log("Cron jobs de facturación configurados (JSON + Hora Argentina)");

export async function sincronizacionManual() {
  console.log("Ejecutando sincronización manual...");
  
  // Calcular la fecha basándonos en la hora argentina
  const fechaHoy = obtenerFechaArgentinaAPI();

  try {
    const [resultFacturas, resultRecibos] = await Promise.all([
      sincronizarFacturas(fechaHoy, fechaHoy),
      sincronizarRecibos(fechaHoy, fechaHoy),
    ]);

    return {
      ok: true,
      message: "Sincronización manual completada",
      data: { resultFacturas, resultRecibos },
    };
  } catch (error) {
    console.error("Error en sincronización manual:", (error as Error).message);
    throw error;
  }
}
