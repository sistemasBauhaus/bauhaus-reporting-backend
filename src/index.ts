import express from 'express';
import dotenv from 'dotenv';
import loginRouter from './routes/login.routes';
import pcMensualRoutes from './routes/pcMensual.routes';
import reportesRoutes from './routes/reportes.routes';
import cierresRoutes from './routes/cierres.routes'; // 👈 AGREGA ESTA LÍNEA
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

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

// 👇 Montá el router de cierres
app.use('/api', cierresRoutes); 
app.use('/api', loginRouter);
app.use('/api', pcMensualRoutes);
app.use('/api', reportesRoutes);

app.get('/', (_req, res) => {
  res.send('🚀 Backend Bauhaus Reporting corriendo correctamente');
});
