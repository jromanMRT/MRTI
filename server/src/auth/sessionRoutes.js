import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { findProfile, signToken } from './shared.js';
import { PASSWORD_MIN_LENGTH } from '../config/security.js';
import { authRequired } from './shared.js';
import { recordAudit } from '../audit.js';

export const sessionRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Se alcanzó el límite de registros. Intenta nuevamente más tarde.' },
});

sessionRouter.get('/registration-status', async (_req, res, next) => {
  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM user_profiles');
    res.json({
      enabled: Number(count) === 0,
      approvalRequired: false,
    });
  } catch (err) {
    next(err);
  }
});

sessionRouter.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { email, password, full_name: fullName } = req.body || {};
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'email, password y full_name son requeridos' });
    }
    if (String(fullName).trim().length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
    }
    if (String(password).length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` });
    }
    if (String(password).length > 128) {
      return res.status(400).json({ error: 'La contraseña no puede exceder 128 caracteres' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido' });
    }
    const [existing] = await pool.query('SELECT id FROM user_profiles WHERE email = ?', [normalizedEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    }

    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM user_profiles');
    if (Number(count) > 0) {
      return res.status(403).json({ error: 'Sólo un administrador puede crear usuarios desde el Core' });
    }
    const isFirstUser = Number(count) === 0;
    const role = isFirstUser ? 'administrator' : 'viewer';
    const isActive = true;
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(String(password), 10);
    await pool.query(
      'INSERT INTO user_profiles (id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [id, normalizedEmail, passwordHash, String(fullName).trim(), role, isActive]
    );

    const token = signToken(id);
    await recordAudit({ req, actor: { id, email: normalizedEmail }, action: 'session.registered', entityType: 'session', entityId: id });
    res.status(201).json({ token, profile: await findProfile(id, `Bearer ${token}`), pendingApproval: false });
  } catch (err) {
    next(err);
  }
});

sessionRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password son requeridos' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.query(
      'SELECT * FROM user_profiles WHERE email = ?',
      [normalizedEmail]
    );
    const user = rows[0];
    const valid = user && (await bcrypt.compare(String(password), user.password_hash));
    if (!valid) {
      await recordAudit({ req, actor: { email: normalizedEmail }, action: 'session.login_failed', entityType: 'session', metadata: { reason: 'invalid_credentials' } });
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    if (!user.is_active) {
      await recordAudit({ req, actor: user, action: 'session.login_failed', entityType: 'session', entityId: user.id, metadata: { reason: 'inactive_account' } });
      return res.status(403).json({ error: 'La cuenta está desactivada' });
    }

    const token = signToken(user.id);
    await recordAudit({ req, actor: user, action: 'session.login_succeeded', entityType: 'session', entityId: user.id });
    res.json({ token, profile: await findProfile(user.id, `Bearer ${token}`) });
  } catch (err) {
    next(err);
  }
});

sessionRouter.post('/logout', authRequired, async (req, res) => {
  await recordAudit({ req, action: 'session.logout', entityType: 'session', entityId: req.user.id });
  res.status(204).end();
});
