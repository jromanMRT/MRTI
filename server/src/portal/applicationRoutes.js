import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../auth/shared.js';
import { recordAudit } from '../audit.js';
import { fetchRemoteAuditEvents, filterAndSortAuditEvents } from './auditSources.js';

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
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 50;
    const [rows] = await pool.query(
      `SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, ip_address, metadata_json, created_at
         FROM audit_events ORDER BY id DESC LIMIT 500`
    );
    const local = rows.map((row) => ({
      event_uuid: `core-${row.id}`,
      module_code: 'core',
      actor_user_id: row.actor_user_id,
      actor_name: null,
      actor_email: row.actor_email,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      request_id: null,
      ip_address: row.ip_address,
      user_agent: null,
      before_json: null,
      after_json: null,
      metadata_json: row.metadata_json,
      status_code: 200,
      created_at: row.created_at,
    }));
    const remote = await fetchRemoteAuditEvents(req.headers.authorization, 500);
    const data = filterAndSortAuditEvents([...local, ...remote.data], req.query).slice(0, limit);
    res.json({ data, sources: [{ source: 'core', ok: true, error: null }, ...remote.sources] });
  } catch (error) {
    next(error);
  }
});

applicationRouter.get('/admin/users/:userId/activity', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const [rows] = await pool.query(
      `SELECT id, action, entity_type, entity_id, ip_address, metadata_json, created_at
         FROM audit_events
        WHERE actor_user_id = ?
        ORDER BY id DESC LIMIT 100`,
      [userId]
    );
    const local = rows.map((row) => ({
      module_code: 'core',
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      ip_address: row.ip_address,
      metadata_json: row.metadata_json,
      created_at: row.created_at,
    }));
    const remote = await fetchRemoteAuditEvents(req.headers.authorization, 200);
    const userEvents = remote.data.filter((e) => e.actor_user_id === userId);
    const all = [...local, ...userEvents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 100);
    const [[loginStats]] = await pool.query(
      `SELECT COUNT(*) AS login_count,
              MIN(created_at) AS first_login,
              MAX(created_at) AS last_login
         FROM audit_events
        WHERE actor_user_id = ? AND action = 'session.login_succeeded'`,
      [userId]
    );
    res.json({
      data: all,
      stats: {
        login_count: loginStats?.login_count || 0,
        first_login: loginStats?.first_login || null,
        last_login: loginStats?.last_login || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

applicationRouter.get('/admin/dashboard-kpis', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().slice(0, 10);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO = weekAgo.toISOString().slice(0, 10);

    const [
      [totalUsers], [activeUsers], [inactiveUsers],
      [loginsToday], [failedToday],
      loginsByDay, recentLogins, recentActivity,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS c FROM user_profiles'),
      pool.query('SELECT COUNT(*) AS c FROM user_profiles WHERE is_active = 1'),
      pool.query('SELECT COUNT(*) AS c FROM user_profiles WHERE is_active = 0'),
      pool.query("SELECT COUNT(*) AS c FROM audit_events WHERE action = 'session.login_succeeded' AND created_at >= ?", [todayISO]),
      pool.query("SELECT COUNT(*) AS c FROM audit_events WHERE action = 'session.login_failed' AND created_at >= ?", [todayISO]),
      pool.query(
        `SELECT DATE(created_at) AS day, COUNT(*) AS logins
           FROM audit_events
          WHERE action = 'session.login_succeeded' AND created_at >= ?
          GROUP BY DATE(created_at) ORDER BY day`,
        [weekAgoISO]
      ),
      pool.query(
        `SELECT a.actor_user_id, p.full_name, p.email, a.created_at, a.ip_address
           FROM audit_events a
           LEFT JOIN user_profiles p ON p.id = a.actor_user_id
          WHERE a.action = 'session.login_succeeded'
          ORDER BY a.created_at DESC LIMIT 10`
      ),
      pool.query(
        `SELECT a.action, a.actor_user_id, p.full_name, p.email, a.entity_type, a.created_at, a.module_code
           FROM audit_events a
           LEFT JOIN user_profiles p ON p.id = a.actor_user_id
          ORDER BY a.created_at DESC LIMIT 15`
      ),
    ]);

    res.json({
      total_users: totalUsers[0].c,
      active_users: activeUsers[0].c,
      inactive_users: inactiveUsers[0].c,
      logins_today: loginsToday[0].c,
      failed_today: failedToday[0].c,
      logins_by_day: loginsByDay[0],
      recent_logins: recentLogins[0],
      recent_activity: recentActivity[0],
    });
  } catch (error) {
    next(error);
  }
});
