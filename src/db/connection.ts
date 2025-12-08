import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// Log para debug
console.log('DB HOST:', process.env.DB_HOST);
console.log('DB NAME:', process.env.DB_NAME);
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const connectionString = process.env.DATABASE_URL || 
  `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

// TEST
async function testDB() {
  try {
    const test = await pool.query('SELECT COUNT(*) FROM usuarios');
    console.log('Usuarios en Render:', test.rows);
  } catch (err) {
    console.error('Error en testDB:', err);
  }
}
testDB();
