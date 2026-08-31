import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import {
  authRequired, findProfile, normalizeProfile, PROFILE_COLUMNS, USER_MANAGERS, USER_ROLES,
} from './shared.js';
import { PASSWORD_MIN_LENGTH } from '../config/security.js';
import { recordAudit } from '../audit.js';

export const userAdminRouter = Router();

userAdminRouter.post('/users', authRequired, async (req, res, next) => {
  try {
    if (req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Sólo un administrador puede crear usuarios' });
    }
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || 'viewer');
    const areaId = req.body?.access_area_id || null;
    if (fullName.length < 2) return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El correo electrónico no es válido' });
    if (password.length < PASSWORD_MIN_LENGTH || password.length > 128) {
      return res.status(400).json({ error: `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y 128 caracteres` });
    }
    if (!USER_ROLES.includes(role)) return res.status(400).json({ error: 'Rol no válido' });
    if (areaId) {
      const [[area]] = await pool.query('SELECT id FROM access_areas WHERE id = ? AND is_active = 1', [areaId]);
      if (!area) return res.status(400).json({ error: 'El área seleccionada no existe o está inactiva' });
    }
    const id = randomUUID();
    await pool.query(
      `INSERT INTO user_profiles
        (id, email, password_hash, password_change_required, full_name, role, access_area_id, is_active)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
      [id, email, await bcrypt.hash(password, 10), fullName, role, areaId, req.body?.is_active !== false]
    );
    await recordAudit({ req, action: 'user.created', entityType: 'user', entityId: id, metadata: { role, access_area_id: areaId, is_active: req.body?.is_active !== false } });
    res.status(201).json({ profile: await findProfile(id, req.headers.authorization) });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo electrónico' });
    }
    next(err);
  }
});

userAdminRouter.get('/assignees', authRequired, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.full_name, p.role
         FROM user_profiles p
        WHERE p.is_active = 1
        ORDER BY p.full_name`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

userAdminRouter.get('/users', authRequired, async (req, res, next) => {
  try {
    if (!USER_MANAGERS.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para consultar usuarios' });
    }
    const [rows] = await pool.query(
      `SELECT ${PROFILE_COLUMNS} FROM user_profiles ORDER BY created_at DESC`
    );
    res.json({ data: rows.map(normalizeProfile) });
  } catch (err) {
    next(err);
  }
});

userAdminRouter.patch('/users/:id', authRequired, async (req, res, next) => {
  try {
    if (!USER_MANAGERS.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tienes permiso para administrar usuarios' });
    }

    const target = await findProfile(req.params.id, req.headers.authorization);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const isSelf = target.id === req.user.id;
    if (isSelf && req.user.role !== 'administrator') {
      return res.status(403).json({ error: 'Sólo un administrador puede cambiar su correo desde el Centro de control' });
    }

    const isAdmin = req.user.role === 'administrator';
    const isSupervisorManager = req.user.role === 'supervisor'
      && ['technician', 'viewer'].includes(target.role);
    if (!isAdmin && !isSupervisorManager) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este usuario' });
    }

    const requested = req.body || {};
    if (isSelf && ['role', 'is_active', 'password'].some((field) => Object.prototype.hasOwnProperty.call(requested, field))) {
      return res.status(400).json({ error: 'Tu rol, estado y contraseña se administran por los controles correspondientes' });
    }
    const updates = {};

    if (Object.prototype.hasOwnProperty.call(requested, 'full_name')) {
      const fullName = String(requested.full_name || '').trim();
      if (fullName.length < 2) {
        return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
      }
      updates.full_name = fullName;
    }

    if (Object.prototype.hasOwnProperty.call(requested, 'email')) {
      const email = String(requested.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'El correo electrónico no es válido' });
      }
      updates.email = email;
    }

    if (Object.prototype.hasOwnProperty.call(requested, 'role')) {
      if (!USER_ROLES.includes(requested.role)) {
        return res.status(400).json({ error: 'Rol no válido' });
      }
      if (!isAdmin && !['technician', 'viewer'].includes(requested.role)) {
        return res.status(403).json({ error: 'Un supervisor sólo puede asignar roles técnico o consulta' });
      }
      updates.role = requested.role;
    }

    if (Object.prototype.hasOwnProperty.call(requested, 'is_active')) {
      updates.is_active = requested.is_active === true
        || requested.is_active === 1
        || requested.is_active === '1';
    }

    if (requested.password) {
      const password = String(requested.password);
      if (password.length < PASSWORD_MIN_LENGTH) {
        return res.status(400).json({ error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres` });
      }
      if (password.length > 128) {
        return res.status(400).json({ error: 'La contraseña no puede exceder 128 caracteres' });
      }
      updates.password_hash = await bcrypt.hash(password, 10);
      updates.password_change_required = 1;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No hay cambios válidos para guardar' });
    }

    const nextRole = updates.role ?? target.role;
    const nextActive = updates.is_active ?? target.is_active;
    const removesActiveAdmin = target.role === 'administrator'
      && target.is_active
      && (!nextActive || nextRole !== 'administrator');
    if (removesActiveAdmin) {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) AS count FROM user_profiles
          WHERE role = 'administrator' AND is_active = 1 AND id <> ?`,
        [target.id]
      );
      if (Number(count) === 0) {
        return res.status(400).json({ error: 'Debe permanecer al menos un administrador activo' });
      }
    }

    const columns = Object.keys(updates);
    await pool.query(
      `UPDATE user_profiles SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((column) => updates[column]), target.id]
    );
    await recordAudit({ req, action: 'user.updated', entityType: 'user', entityId: target.id, metadata: { fields: columns } });
    res.json({ profile: await findProfile(target.id, req.headers.authorization) });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ese correo electrónico ya pertenece a otro usuario' });
    }
    next(err);
  }
});
