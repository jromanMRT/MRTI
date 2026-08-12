import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../auth/shared.js';
import { recordAudit } from '../audit.js';

export const applicationRouter = Router();

function administratorOnly(req, res, next) {
  if (req.user?.role !== 'administrator') {
    return res.status(403).json({ error: 'Sólo un administrador puede gestionar aplicaciones' });
  }
  return next();
}

function parseFeatures(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function serializeApplication(row) {
  return { ...row, features: parseFeatures(row.features_json) };
}

function validCode(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validInternalUrl(value) {
  return value.startsWith('/') && !value.startsWith('//') && !/[\r\n]/.test(value);
}

function applicationFields(body, { creating = false } = {}) {
  const fields = {};
  if (creating) {
    const code = String(body.code || '').trim().toLowerCase();
    if (!validCode(code) || code.length > 50) throw Object.assign(new Error('Código de aplicación no válido'), { status: 400 });
    fields.code = code;
  }
  if (creating || Object.hasOwn(body, 'name')) {
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 120) throw Object.assign(new Error('Nombre de aplicación no válido'), { status: 400 });
    fields.name = name;
  }
  if (creating || Object.hasOwn(body, 'description')) {
    const description = String(body.description || '').trim();
    if (description.length < 5 || description.length > 500) throw Object.assign(new Error('Descripción no válida'), { status: 400 });
    fields.description = description;
  }
  if (creating || Object.hasOwn(body, 'url')) {
    const url = String(body.url || '').trim();
    if (!validInternalUrl(url) || url.length > 255) throw Object.assign(new Error('La URL debe ser una ruta interna que comience con /'), { status: 400 });
    fields.url = url;
  }
  if (creating || Object.hasOwn(body, 'category')) {
    const category = String(body.category || 'Empresa').trim();
    if (!category || category.length > 80) throw Object.assign(new Error('Categoría no válida'), { status: 400 });
    fields.category = category;
  }
  if (Object.hasOwn(body, 'icon_key')) fields.icon_key = String(body.icon_key || 'application').trim().slice(0, 50) || 'application';
  if (Object.hasOwn(body, 'features')) fields.features_json = JSON.stringify(parseFeatures(body.features));
  if (Object.hasOwn(body, 'status')) {
    const status = String(body.status);
    if (!['active', 'maintenance', 'inactive'].includes(status)) throw Object.assign(new Error('Estado de aplicación no válido'), { status: 400 });
    fields.status = status;
  }
  if (Object.hasOwn(body, 'sort_order')) {
    const sortOrder = Number(body.sort_order);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) throw Object.assign(new Error('Orden no válido'), { status: 400 });
    fields.sort_order = sortOrder;
  }
  return fields;
}

applicationRouter.get('/applications', authRequired, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, description, url, category, icon_key, features_json, status, sort_order
         FROM applications
        WHERE status IN ('active', 'maintenance')
        ORDER BY sort_order, name`
    );
    const allowed = req.user.role === 'administrator'
      ? rows
      : rows.filter((row) => req.user.allowed_modules?.includes(row.code));
    res.json({ data: allowed.map(serializeApplication) });
  } catch (error) {
    next(error);
  }
});

applicationRouter.get('/admin/applications', authRequired, administratorOnly, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, description, url, category, icon_key, features_json, status, sort_order, created_at, updated_at
         FROM applications ORDER BY sort_order, name`
    );
    res.json({ data: rows.map(serializeApplication) });
  } catch (error) {
    next(error);
  }
});

applicationRouter.post('/admin/applications', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const fields = applicationFields(req.body || {}, { creating: true });
    fields.icon_key ??= 'application';
    fields.features_json ??= '[]';
    fields.status ??= 'active';
    fields.sort_order ??= 100;
    const id = randomUUID();
    const columns = Object.keys(fields);
    await pool.query(
      `INSERT INTO applications (id, ${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
      [id, ...columns.map((column) => fields[column])]
    );
    await recordAudit({ req, action: 'application.created', entityType: 'application', entityId: id, metadata: { code: fields.code } });
    res.status(201).json({ id });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una aplicación con ese código' });
    next(error);
  }
});

applicationRouter.patch('/admin/applications/:id', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const [[existing]] = await pool.query('SELECT id, code FROM applications WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Aplicación no encontrada' });
    const fields = applicationFields(req.body || {});
    if (!Object.keys(fields).length) return res.status(400).json({ error: 'No hay cambios válidos para guardar' });
    const columns = Object.keys(fields);
    await pool.query(
      `UPDATE applications SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = ?`,
      [...columns.map((column) => fields[column]), existing.id]
    );
    await recordAudit({ req, action: 'application.updated', entityType: 'application', entityId: existing.id, metadata: { code: existing.code, fields: columns } });
    res.json({ success: true });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una aplicación con ese código' });
    next(error);
  }
});

applicationRouter.get('/admin/audit', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;
    const [rows] = await pool.query(
      `SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, ip_address, metadata_json, created_at
         FROM audit_events ORDER BY id DESC LIMIT ?`,
      [limit]
    );
    res.json({ data: rows.map((row) => ({ ...row, metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null })) });
  } catch (error) {
    next(error);
  }
});
