import cron from "node-cron";
import fetch from "node-fetch";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000/api";

// Ejecutar cada 10 minutos
cron.schedule("*/10 * * * *", async () => {
  console.log("⏰ Cron ejecutado:", new Date().toISOString());

  const hoy = new Date().toISOString().split("T")[0];
  const primerDiaMes = new Date();
  primerDiaMes.setDate(1);
  const fechaInicio = primerDiaMes.toISOString().split("T")[0];

  try {
    const res = await fetch(`${BACKEND_URL}/cierres/sync-auto?fechaInicio=${fechaInicio}&fechaFin=${hoy}`, {
      method: "POST"
    });
    const json = await res.json() as any;
    console.log("✅ Sincronización completada:", json.message || json);
  } catch (error) {
    console.error("❌ Error en el cron de cierres:", (error as Error).message);
  }
});
