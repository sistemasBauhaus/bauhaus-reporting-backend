import { pool } from "./src/db/connection";

// Lista de productos a insertar (IdArticulo y Descripcion)
const productos = [
  { id: 345, descripcion: "QUANTIUM NAFTA" },
  { id: 346, descripcion: "SUPER" },
  { id: 348, descripcion: "DIESEL X10" },
  { id: 351, descripcion: "QUANTIUM DIESEL" },
  { id: 4039, descripcion: "ECO BLUE" },
  // Agrega aquí más productos si aparecen nuevos
];

async function insertarProductos() {
  for (const prod of productos) {
    try {
      await pool.query(
        `INSERT INTO productos (id, descripcion) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [prod.id, prod.descripcion]
      );
      console.log(`✅ Producto insertado: ${prod.descripcion} (${prod.id})`);
    } catch (err) {
      console.error(`❌ Error al insertar producto ${prod.descripcion}:`, (err as Error).message);
    }
  }
  process.exit();
}

insertarProductos();
