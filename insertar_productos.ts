import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { pool } from "./src/db/connection";


// Lista de productos a insertar (producto_id, nombre, categoria, tipo)
const BASE_URL = process.env.API_BASE_URL as string;
const TOKEN = process.env.API_TOKEN as string;

async function insertarProductosDesdeAPI() {
  const res = await fetch(`${BASE_URL}/Articulos/GetAllArticulos`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const xml = await res.text();
  console.log("Respuesta cruda de la API:", xml);
  const data = await parseStringPromise(xml, { explicitArray: false });
  let articulos = data?.ArrayOfArticulo?.Articulo || data?.Articulos?.Articulo || [];
  if (!Array.isArray(articulos)) articulos = [articulos];

  for (const art of articulos) {
    const producto_id = Number(art.IdArticulo);
    const nombre = art.Descripcion || "Sin nombre";
    // Deducción simple de origen y categoría
    let origen = "Playa";
    let categoria = "OTROS";
    if (art.EsCombustible === "true" || art.EsCombustible === true) categoria = "LIQUIDOS";
    if (art.EsLubricante === "true" || art.EsLubricante === true) categoria = "LUBRICANTES";
    if (nombre.toUpperCase().includes("GNC")) categoria = "GNC";
    if (nombre.toUpperCase().includes("SHOP") || nombre.toUpperCase().includes("GOLOSINAS") || nombre.toUpperCase().includes("BEBIDAS")) origen = "Shop";

    try {
      await pool.query(
        `INSERT INTO dim_producto (producto_id, nombre, origen, categoria) VALUES ($1, $2, $3, $4) ON CONFLICT (producto_id) DO NOTHING`,
        [producto_id, nombre, origen, categoria]
      );
      console.log(`✅ Producto insertado: ${nombre} (${producto_id})`);
    } catch (err) {
      console.error(`❌ Error al insertar producto ${nombre}:`, (err as Error).message);
    }
  }
  process.exit();
}

insertarProductosDesdeAPI();
