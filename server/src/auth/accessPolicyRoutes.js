import { isDeepStrictEqual } from 'node:util';
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, findProfileIdentity, USER_ROLES } from './shared.js';
import { parsePolicy, validatePolicy } from './accessPolicy.js';
import { PERMISSION_CATALOG, LEVEL_LABELS, permissionFor } from '../vendor/mrti-platform/permissions.js';

export const accessPolicyRouter = Router();
accessPolicyRouter.use('/permissions', authRequired);
accessPolicyRouter.get('/permissions/me', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ profile: req.user, catalog: PERMISSION_CATALOG, levels: LEVEL_LABELS });
});
accessPolicyRouter.use('/permissions/admin', (req, res, next) => req.user.role === 'administrator' ? next() : res.status(403).json({ error: 'Sólo un administrador puede gestionar permisos' }));
accessPolicyRouter.get('/permissions/admin', async (req, res, next) => {
  try {
    const [policies] = await pool.query('SELECT subject_type, subject_id, policy_json, revision, updated_at FROM access_policies');
    const [events] = await pool.query('SELECT id, subject_type, subject_id, actor_id, reason, created_at FROM access_policy_events ORDER BY id DESC LIMIT 50');
    res.set('Cache-Control', 'no-store').json({ catalog: PERMISSION_CATALOG, levels: LEVEL_LABELS, roles: USER_ROLES, policies: policies.map((row) => ({ ...row, policy: parsePolicy(row.policy_json), policy_json: undefined })), events });
  } catch (error) { next(error); }
});
accessPolicyRouter.get('/permissions/admin/users/:id', async (req, res, next) => {
  try {
    const profile = await findProfileIdentity(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.set('Cache-Control', 'no-store').json({ profile, effective: PERMISSION_CATALOG.map((m) => ({ code: m.code, allowed: profile.is_active && profile.allowed_modules.includes(m.code), sections: m.sections.map((s) => ({ id: s.id, level: permissionFor(profile, m.code, s.id) })) })) });
  } catch (error) { next(error); }
});
accessPolicyRouter.put('/permissions/admin/:type/:id', async (req, res, next) => {
  const { type, id } = req.params;
  if (!['role','user'].includes(type) || (type === 'role' && !USER_ROLES.includes(id))) return res.status(400).json({ error: 'Rol o usuario no válido' });
  const reason = String(req.body?.reason || '').trim();
  const revision = req.body?.revision;
  if (reason.length < 5 || reason.length > 500 || !Number.isInteger(revision) || revision < 0) return res.status(400).json({ error: 'Indica un motivo (5–500 caracteres) y la revisión actual' });
  let policy;
  try { policy = validatePolicy(req.body.policy); } catch (error) { return res.status(400).json({ error: error.message }); }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // La fila de identidad serializa también la primera escritura (sin política todavía).
    const [users] = await connection.query(type === 'user' ? 'SELECT id, role FROM user_profiles WHERE id = ? FOR UPDATE' : 'SELECT id, role FROM user_profiles WHERE role = ? ORDER BY id FOR UPDATE', [id]);
    if (type === 'user' && !users.length) { await connection.rollback(); return res.status(404).json({ error: 'Usuario no encontrado' }); }
    if (id === 'administrator' || (type === 'user' && users[0].role === 'administrator')) { await connection.rollback(); return res.status(409).json({ error: 'El administrador global conserva acceso total. Asigna otro rol para limitar una cuenta.' }); }
    const [[before]] = await connection.query('SELECT policy_json, revision FROM access_policies WHERE subject_type = ? AND subject_id = ? FOR UPDATE', [type, id]);
    if ((before?.revision || 0) !== revision) { await connection.rollback(); return res.status(409).json({ error: 'Los permisos cambiaron. Recarga antes de guardar.' }); }
    const previous = parsePolicy(before?.policy_json);
    if (isDeepStrictEqual(previous, policy)) { await connection.rollback(); return res.json({ revision, unchanged: true }); }
    await connection.query('INSERT INTO access_policies (subject_type, subject_id, policy_json, revision, updated_by) VALUES (?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE policy_json = VALUES(policy_json), revision = revision + 1, updated_by = VALUES(updated_by)', [type, id, JSON.stringify(policy), req.user.id]);
    await connection.query('INSERT INTO access_policy_events (subject_type, subject_id, actor_id, before_json, after_json, reason) VALUES (?, ?, ?, ?, ?, ?)', [type, id, req.user.id, JSON.stringify(previous), JSON.stringify(policy), reason]);
    await connection.commit();
    res.json({ revision: revision + 1 });
  } catch (error) { await connection.rollback(); if (['ER_LOCK_DEADLOCK','ER_DUP_ENTRY'].includes(error.code)) return res.status(409).json({ error: 'Otro administrador guardó al mismo tiempo. Recarga e inténtalo de nuevo.' }); next(error); }
  finally { connection.release(); }
});
