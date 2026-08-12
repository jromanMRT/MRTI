import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { authRequired, findProfile } from './shared.js';
import { PASSWORD_MIN_LENGTH } from '../config/security.js';
import { recordAudit } from '../audit.js';

export const profileRouter = Router();

profileRouter.get('/me', authRequired, (req, res) => {
  res.json({ profile: req.user });
});

profileRouter.patch('/profile', authRequired, async (req, res, next) => {
  try {
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (fullName.length < 2) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido' });
    }

    await pool.query(
      'UPDATE user_profiles SET full_name = ?, email = ? WHERE id = ?',
      [fullName, email, req.user.id]
    );
    await recordAudit({ req, action: 'profile.updated', entityType: 'user', entityId: req.user.id, metadata: { fields: ['full_name', 'email'] } });
    res.json({ profile: await findProfile(req.user.id, req.headers.authorization) });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese correo electrónico ya pertenece a otro usuario' });
    }
    next(err);
  }
});

profileRouter.patch('/profile/password', authRequired, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = String(req.body?.new_password || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'La contraseña actual y la nueva son requeridas' });
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: `La nueva contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'La contraseña no puede exceder 128 caracteres' });
    }

    const [rows] = await pool.query(
      'SELECT password_hash FROM user_profiles WHERE id = ?',
      [req.user.id]
    );
    const valid = rows[0] && await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'La contraseña actual es incorrecta' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE user_profiles SET password_hash = ? WHERE id = ?',
      [passwordHash, req.user.id]
    );
    await recordAudit({ req, action: 'profile.password_changed', entityType: 'user', entityId: req.user.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
