dotenv.config();

import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE,
});

// Categorizar producto según nombre o ID
function categorizarProducto(productoId: number, nombreProd: string): string {
  const nombre = (nombreProd || "").toUpperCase();
  if (productoId === 8 || /SHOP/.test(nombre)) return "SHOP";
  if (/GOLOSINA|BEBIDA/.test(nombre)) return "GOLOSINAS";
  if (/GNC/.test(nombre)) return "GNC";
  if (/SUPER|INFINIA|DIESEL|ULTRA|PREMIUM|NAFTA/.test(nombre)) return "COMBUSTIBLES";
  if (/LUBRI/.test(nombre)) return "LUBRICANTES";
  if (/ADBLUE/.test(nombre)) return "ADBLUE";
  if (/SPOT|BAR|FOOD/.test(nombre)) return "SPOT";
  return "OTROS";
}

async function actualizarCategorias() {
  const { rows } = await pool.query('SELECT producto_id, nombre FROM dim_producto');
  for (const row of rows) {
    const categoria = categorizarProducto(row.producto_id, row.nombre);
    await pool.query(
      'UPDATE dim_producto SET categoria = $1 WHERE producto_id = $2',
      [categoria, row.producto_id]
    );
    console.log(`Producto ${row.nombre} (${row.producto_id}) → ${categoria}`);
  }
  await pool.end();
  console.log('✅ Categorías actualizadas.');
}

actualizarCategorias().catch(e => {
  console.error('❌ Error actualizando categorías:', e);
  process.exit(1);
});
