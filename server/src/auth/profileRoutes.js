import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authRequired, findProfile } from './shared.js';
import { PASSWORD_MIN_LENGTH } from '../config/security.js';
import { recordAudit } from '../audit.js';

export const profileRouter = Router();

profileRouter.get('/me', authRequired, async (req, res, next) => {
  try {
    res.json({ profile: await findProfile(req.user.id, req.headers.authorization) });
  } catch (err) {
    next(err);
  }
});

// Variante liviana de /me: sólo identidad local (rol, módulos permitidos,
// cuenta activa), sin resolver la ubicación física contra MRTI-Obs. Pensada
// para que otros servicios (Obs, Activos, RH, Tickets) validen sesiones sin
// disparar una llamada cruzada a Obs en cada request — ver la nota en
// findProfileIdentity (shared.js) sobre el ciclo Core↔Obs que esto evita.
profileRouter.get('/identity', authRequired, (req, res) => {
  res.json({ profile: req.user });
});

profileRouter.patch('/profile', authRequired, async (req, res, next) => {
  try {
    const fullName = String(req.body?.full_name || '').trim();
    if (fullName.length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {
      const requestedEmail = String(req.body.email || '').trim().toLowerCase();
      if (requestedEmail !== String(req.user.email || '').trim().toLowerCase()) {
        return res.status(403).json({
          error: 'Sólo un administrador puede cambiar el correo electrónico desde el Centro de control',
          code: 'EMAIL_ADMIN_ONLY',
        });
      }
    }

    await pool.query(
      'UPDATE user_profiles SET full_name = ? WHERE id = ?',
      [fullName, req.user.id]
    );
    await recordAudit({ req, action: 'profile.updated', entityType: 'user', entityId: req.user.id, metadata: { fields: ['full_name'] } });
    res.json({ profile: await findProfile(req.user.id, req.headers.authorization) });
  } catch (err) {
    next(err);
  }
});

profileRouter.patch('/profile/password', authRequired, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    if (!newPassword) return res.status(400).json({ error: 'La nueva contraseña es requerida' });
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'La contraseña no puede exceder 128 caracteres' });
    }

    const [rows] = await pool.query(
      'SELECT password_hash, password_change_required FROM user_profiles WHERE id = ?',
      [req.user.id]
    );
    if (!rows[0]) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
    // En el primer inicio con contraseña temporal la persona acaba de
    // escribirla para entrar: no se vuelve a pedir. Fuera de ese caso sigue
    // siendo obligatoria para que una sesión abierta no baste para cambiarla.
    if (rows[0].password_change_required) {
      if (await bcrypt.compare(newPassword, rows[0].password_hash)) {
        return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la temporal' });
      }
    } else {
      if (!currentPassword) return res.status(400).json({ error: 'La contraseña actual y la nueva son requeridas' });
      if (!await bcrypt.compare(currentPassword, rows[0].password_hash)) {
        return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE user_profiles SET password_hash = ?, password_change_required = 0 WHERE id = ?',
      [passwordHash, req.user.id]
    );
    await recordAudit({ req, action: 'profile.password_changed', entityType: 'user', entityId: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
