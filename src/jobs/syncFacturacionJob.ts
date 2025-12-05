import { sincronizarFacturas } from "../services/facturas.service";
import { sincronizarRecibos } from "../services/recibos.service";
import cron from "node-cron";

function getArgentinaDates() {
  const now = new Date();
  const arString = now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
  const todayAr = new Date(arString);

  const yesterdayAr = new Date(todayAr);
  yesterdayAr.setDate(todayAr.getDate() - 1);

  return { yesterday: yesterdayAr, today: todayAr };
}

// Format Date YYYY-MM-DD (Facturas)
function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format Date DD-MM-YYYY (Recibos)
function formatDateCustom(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}-${month}-${year}`;
}


// Función para reintentar.
async function withRetry(fn: Function, args: any[], contextName: string, maxRetries = 50) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      attempt++;
      return await fn(...args);
    } catch (error) {
      console.error(`[Intentando ${attempt}/${maxRetries}] Fallido ${contextName}: ${(error as Error).message}`);
      if (attempt === maxRetries) {
        console.error(`[Fatal] Se alcanzaron los reintentos máximos ${contextName}.`);
        throw error;
      }
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

async function ejecutarSincronizacion() {
  const { yesterday, today } = getArgentinaDates();

  console.log("Iniciando trabajo de sincronización diaria (hora de Argentina)");
  
  const facturasInicio = formatDateISO(yesterday);
  const facturasFin = formatDateISO(today);
  const recibosInicio = formatDateCustom(yesterday);
  const recibosFin = formatDateCustom(today);

  console.log(`Fechas: Facturas [${facturasInicio} - ${facturasFin}] | Recibos [${recibosInicio} - ${recibosFin}]`);

  try {
    const results = await Promise.allSettled([
      withRetry(sincronizarFacturas, [facturasInicio, facturasFin], "Facturas Service"),
      withRetry(sincronizarRecibos, [recibosInicio, recibosFin], "Recibos Service")
    ]);

    const resFacturas = results[0];
    const resRecibos = results[1];

    if (resFacturas.status === 'fulfilled') {
      console.log(`Facturas: ${resFacturas.value.insertados} new, ${resFacturas.value.actualizados} updated`);
    } else {
      console.error(`Facturas fallidas después de 50 intentos.`);
    }

    if (resRecibos.status === 'fulfilled') {
      console.log(`Recibos: ${resRecibos.value.insertados} new, ${resRecibos.value.actualizados} updated`);
    } else {
      console.error(`Recibos falló después de 50 intentos.`);
    }

    console.log("Job Cycle finalizado.");

  } catch (error) {
    console.error("Critical Job Error:", error);
  }
}

export async function sincronizacionManual() {
  const { yesterday, today } = getArgentinaDates();

  const facturasInicio = formatDateISO(yesterday);
  const facturasFin = formatDateISO(today);
  const recibosInicio = formatDateCustom(yesterday);
  const recibosFin = formatDateCustom(today);

  // Si falla uno, se generará un error en el controlador (lo cual es útil para HTTP 500).
  const [resFacturas, resRecibos] = await Promise.all([
    withRetry(sincronizarFacturas, [facturasInicio, facturasFin], "Facturas Service"),
    withRetry(sincronizarRecibos, [recibosInicio, recibosFin], "Recibos Service")
  ]);

  return {
    ok: true,
    message: "Sincronización completada",
    data: { resFacturas, resRecibos },
  };
}

cron.schedule("0 0 * * *", () => {
  ejecutarSincronizacion();
}, {
  timezone: "America/Argentina/Buenos_Aires"
});
