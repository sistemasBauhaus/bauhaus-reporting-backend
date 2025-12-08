import express from 'express';
import dotenv from 'dotenv';
import loginRouter from './routes/login.routes';
import pcMensualRoutes from './routes/pcMensual.routes';
import reportesRoutes from './routes/reportes.routes';
import cierresRoutes from './routes/cierres.routes';
import facturasRoutes from './routes/facturas.routes';
import positionsRoutes from './routes/positions.routes';
import facturacionRoutes from './routes/facturacion.routes';
import ctacteRoutes from './routes/ctacte.routes';
import cors from 'cors';
import path from 'path';
import { cargarMapeos } from './utils/mapeos';
import './jobs/syncCierresJob'; // 👈 Activa la tarea automática de cierres
import './jobs/syncFacturacionJob'; // 👈 Activa la tarea automática de facturación
import tanquesRoutes from './routes/tanques.routes';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 8080;

async function start() {
  await cargarMapeos(); // 👈 Cargar mapeos antes de iniciar todo

  app.use(cors({
    origin: [
      'http://localhost:3000',
      'https://bauhaus-reporting-evp6.vercel.app',
      'https://bauhaus-reporting-l3ai.vercel.app',
      'https://bauhaus-reporting.vercel.app',
      'https://bauhaus-reporting-6t7b.vercel.app/',
      'https://bauhaus-reporting-frontend.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  app.use(express.json());

  // 🔹 Middleware de logging para todas las peticiones
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      console.log("📥 [DEBUG] ========================================");
      console.log("📥 [DEBUG] Petición recibida");
      console.log("📥 [DEBUG] Método:", req.method);
      console.log("📥 [DEBUG] URL:", req.url);
      console.log("📥 [DEBUG] Path:", req.path);
      console.log("📥 [DEBUG] Query:", req.query);
      console.log("📥 [DEBUG] Body:", req.body);
      console.log("📥 [DEBUG] ========================================");
      next();
    });
  }

  // 🔹 Montar rutas de API
  if (process.env.NODE_ENV !== 'production') {
    console.log("🔍 [DEBUG] Registrando rutas de API...");
  }
  // Rutas de usuarios, empresas, roles, permisos, etc.
  const userRoutes = require('./routes/user.routes').default;
  app.use('/api', userRoutes);
  app.use('/api', cierresRoutes);
  app.use('/api', loginRouter);
  app.use('/api', pcMensualRoutes);
  app.use('/api', reportesRoutes);
  app.use('/api', facturasRoutes);
  app.use('/api/positions', positionsRoutes);
  app.use('/api', facturacionRoutes);
  app.use('/api', ctacteRoutes);
  app.use('/api/tanques', tanquesRoutes);
  if (process.env.NODE_ENV !== 'production') {
    console.log("✅ [DEBUG] Todas las rutas de API registradas");
  }

  // 🔹 Endpoint raíz
  app.get('/', (_req, res) => {
    res.send('🚀 Backend Bauhaus Reporting corriendo correctamente');
  });

  // 🔹 Servir frontend en producción
  if (process.env.NODE_ENV === 'production') {
    const buildPath = path.join(__dirname, '../build');
    app.use(express.static(buildPath));
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    }
  });
}

start();
