
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

console.log('DB HOST:', process.env.DB_HOST);
console.log('DB NAME:', process.env.DB_NAME);
console.log('DATABASE_URL:', process.env.DATABASE_URL);

export const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),
});

// Pruebas de conexión y datos
async function testDB() {
  try {
    const test = await pool.query('SELECT COUNT(*) FROM usuarios');
    console.log('Usuarios en Render:', test.rows);
    const test2 = await pool.query('SELECT * FROM roles LIMIT 5');
    console.log('Roles en Render:', test2.rows);
    const info = await pool.query('SELECT current_database(), current_user');
    console.log('DB Info:', info.rows);
  } catch (err) {
    console.error('Error en testDB:', err);
  }
}
testDB();
