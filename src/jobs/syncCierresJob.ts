import cron from "node-cron";
import fetch from "node-fetch";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

// Ejecutar cada día a las 03:00 AM
cron.schedule("0 3 * * *", async () => {
  console.log("🕒 Ejecutando sincronización automática de cierres...");

  try {
    const res = await fetch(`${BACKEND_URL}/cierres/sync-auto`, { method: "POST" });
    const json = await res.json() as any;
    console.log("✅ Sincronización completada:", json.message || json);
  } catch (error) {
    console.error("❌ Error en el cron de cierres:", (error as Error).message);
  }
});
