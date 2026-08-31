import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter, authRequired } from './auth.js';
import { pool } from './db.js';
import { validateCorsOrigin } from './config/security.js';
import { applicationRouter } from './portal/applicationRoutes.js';
import { brandAssetRouter } from './portal/brandAssetRoutes.js';
import { notificationRouter } from './portal/notificationRoutes.js';

const app = express();
const PORT = Number(process.env.PORT || 3005);

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(helmet({
  strictTransportSecurity: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    },
  },
}));
app.use(cors({ origin: validateCorsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'mysql' });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Sin conexión a MySQL' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/portal/v1', applicationRouter);
app.use('/api/portal/v1', brandAssetRouter);
app.use('/api/portal/v1', notificationRouter);

// Ruta de diagnóstico interno para probar tokens emitidos por Core/Infra de
// forma intercambiable durante la Fase 1. No forma parte del contrato público.
app.get('/api/auth/_whoami', authRequired, (req, res) => {
  res.json({ id: req.user.id, role: req.user.role });
});

// Manejo central de errores
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`MRTI Core (auth) escuchando en http://localhost:${PORT}`);
});
