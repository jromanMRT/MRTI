import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter, authRequired } from './auth.js';
import { pool } from './db.js';
import { validateCorsOrigin } from './config/security.js';
import { applicationRouter } from './portal/applicationRoutes.js';
import { brandAssetRouter } from './portal/brandAssetRoutes.js';
import { notificationRouter } from './portal/notificationRoutes.js';
import { companyNewsRouter } from './portal/companyNewsRoutes.js';
import { companyHomeRouter } from './portal/companyHomeRoutes.js';
import { portalSearchRouter } from './portal/searchRoutes.js';
import { platformArchitectureRouter } from './portal/platformArchitectureRoutes.js';
import { communityRouter } from './community/index.js';
import { requestContext } from './vendor/mrti-platform/request-context.js';

const app = express();
const PORT = Number(process.env.PORT || 3005);

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(requestContext({ service: 'mrti-core-api' }));
app.use(helmet({
  strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
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
app.use('/api/', rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1',
}));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/portal/v1', applicationRouter);
app.use('/api/portal/v1', brandAssetRouter);
app.use('/api/portal/v1', notificationRouter);
app.use('/api/portal/v1', companyNewsRouter);
app.use('/api/portal/v1', companyHomeRouter);
app.use('/api/portal/v1', portalSearchRouter);
app.use('/api/portal/v1', platformArchitectureRouter);
app.use('/api/portal/v1/community', communityRouter);

// Ruta de diagnóstico interno para probar tokens emitidos por Core/Infra de
// forma intercambiable durante la Fase 1. No forma parte del contrato público.
app.get('/api/auth/_whoami', authRequired, (req, res) => {
  res.json({ id: req.user.id, role: req.user.role });
});

// Manejo central de errores
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const message = status >= 500 ? 'Error interno del servidor' : (err.message || 'Error interno del servidor');
  res.status(status).json({ error: message });
});

const DOCKER_BRIDGES = ['172.17.0.1', '172.22.0.1'];
app.listen(PORT, '127.0.0.1', () => {
  console.log(`MRTI Core (auth) escuchando en http://127.0.0.1:${PORT}`);
});
for (const ip of DOCKER_BRIDGES) {
  app.listen(PORT, ip, () => {
    console.log(`MRTI Core (auth) escuchando en http://${ip}:${PORT}`);
  });
}
