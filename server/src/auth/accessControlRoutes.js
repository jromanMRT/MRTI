import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, findProfile, MODULE_CODES } from './shared.js';

export const accessControlRouter = Router();

const MODULE_CATALOG = [
  { code: 'mrti-infra', name: 'MRTI Infra' },
  { code: 'tickets', name: 'MRTI Tickets' },
  { code: 'agent-core', name: 'MRTI Agent Core' },
  { code: 'activos', name: 'MRTI Activos' },
  { code: 'rh', name: 'MRTI RH' },
];

function administratorOnly(req, res, next) {
  if (req.user?.role !== 'administrator') {
    return res.status(403).json({ error: 'Sólo un administrador puede gestionar accesos' });
  }
  return next();
}

function normalizedModules(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String))].filter((code) => MODULE_CODES.includes(code));
}

async function replaceAreaModules(connection, areaId, modules) {
  await connection.query('DELETE FROM access_area_modules WHERE area_id = ?', [areaId]);
  for (const moduleCode of modules) {
    await connection.query(
      'INSERT INTO access_area_modules (area_id, module_code) VALUES (?, ?)',
      [areaId, moduleCode]
    );
  }
}

accessControlRouter.get('/access-control', authRequired, administratorOnly, async (_req, res, next) => {
  try {
    const [areas] = await pool.query(
      `SELECT a.id, a.name, a.description, a.is_active, a.created_at, a.updated_at,
              GROUP_CONCAT(am.module_code ORDER BY am.module_code) AS module_codes
         FROM access_areas a
         LEFT JOIN access_area_modules am ON am.area_id = a.id
        GROUP BY a.id
        ORDER BY a.is_active DESC, a.name`
    );
    const [users] = await pool.query(
      `SELECT p.id, p.user_number, p.email, p.full_name, p.role, p.access_area_id,
              p.physical_area_id, p.is_active, a.name AS access_area_name,
              pa.name AS physical_area_name
         FROM user_profiles p
         LEFT JOIN access_areas a ON a.id = p.access_area_id
         LEFT JOIN areas pa ON pa.id = p.physical_area_id
        ORDER BY p.user_number`
    );
    const [physicalAreas] = await pool.query(
      `SELECT a.id, a.name, f.name AS floor_name, b.name AS building_name,
              s.id AS site_id, s.name AS site_name
         FROM areas a
         INNER JOIN floors f ON f.id = a.floor_id
         INNER JOIN buildings b ON b.id = f.building_id
         INNER JOIN sites s ON s.id = b.site_id
        WHERE a.is_active = 1 AND f.is_active = 1 AND b.is_active = 1 AND s.is_active = 1
        ORDER BY s.name, b.name, f.floor_number, a.name`
    );
    const [devices] = await pool.query(
      `SELECT d.id, d.internal_id, d.name, d.area_id, d.assigned_user_id,
              d.is_primary_user_device, a.name AS area_name
         FROM devices d
         LEFT JOIN areas a ON a.id = d.area_id
        WHERE d.is_active = 1
        ORDER BY d.internal_id, d.name`
    );
    res.json({
      modules: MODULE_CATALOG,
      areas: areas.map((area) => ({
        ...area,
        is_active: Boolean(area.is_active),
        module_codes: area.module_codes ? area.module_codes.split(',') : [],
      })),
      users: users.map((user) => ({ ...user, is_active: Boolean(user.is_active) })),
      physical_areas: physicalAreas,
      devices: devices.map((device) => ({
        ...device,
        is_primary_user_device: Boolean(device.is_primary_user_device),
      })),
    });
  } catch (error) {
    next(error);
  }
});

accessControlRouter.patch('/users/:id/location', authRequired, administratorOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const target = await findProfile(req.params.id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const physicalAreaId = req.body?.physical_area_id || null;
    const primaryDeviceId = req.body?.primary_device_id || null;
    if (physicalAreaId) {
      const [[area]] = await connection.query('SELECT id FROM areas WHERE id = ? AND is_active = 1', [physicalAreaId]);
      if (!area) return res.status(400).json({ error: 'El área física no existe o está inactiva' });
    }
    if (primaryDeviceId) {
      const [[device]] = await connection.query(
        'SELECT id, area_id, assigned_user_id FROM devices WHERE id = ? AND is_active = 1',
        [primaryDeviceId]
      );
      if (!device) return res.status(400).json({ error: 'El equipo habitual no existe o está inactivo' });
      if (!physicalAreaId || device.area_id !== physicalAreaId) {
        return res.status(400).json({ error: 'El equipo habitual debe pertenecer al área física del usuario' });
      }
      if (device.assigned_user_id && device.assigned_user_id !== target.id) {
        return res.status(409).json({ error: 'Ese equipo ya está vinculado a otro usuario' });
      }
    }
    await connection.beginTransaction();
    await connection.query('UPDATE user_profiles SET physical_area_id = ? WHERE id = ?', [physicalAreaId, target.id]);
    await connection.query(
      'UPDATE devices SET assigned_user_id = NULL, assigned_user = NULL, is_primary_user_device = 0 WHERE assigned_user_id = ? AND is_primary_user_device = 1',
      [target.id]
    );
    if (primaryDeviceId) {
      await connection.query(
        'UPDATE devices SET assigned_user_id = ?, assigned_user = ?, is_primary_user_device = 1 WHERE id = ?',
        [target.id, target.full_name, primaryDeviceId]
      );
    }
    await connection.commit();
    res.json({ profile: await findProfile(target.id) });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

accessControlRouter.get('/module-access/:moduleCode', authRequired, (req, res) => {
  const moduleCode = String(req.params.moduleCode || '');
  if (!MODULE_CODES.includes(moduleCode)) return res.status(404).json({ error: 'Módulo no encontrado' });
  if (req.user.role !== 'administrator' && !req.user.allowed_modules?.includes(moduleCode)) {
    return res.status(403).json({ error: 'Tu área no tiene acceso a este módulo', code: 'MODULE_FORBIDDEN' });
  }
  return res.status(204).end();
});

accessControlRouter.post('/access-areas', authRequired, administratorOnly, async (req, res, next) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  const modules = normalizedModules(req.body?.module_codes);
  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ error: 'El nombre del área debe tener entre 2 y 120 caracteres' });
  }
  if (modules.length === MODULE_CODES.length) {
    return res.status(400).json({ error: 'Sólo los administradores pueden tener acceso a todos los módulos' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = randomUUID();
    await connection.query(
      'INSERT INTO access_areas (id, name, description) VALUES (?, ?, ?)',
      [id, name, description]
    );
    await replaceAreaModules(connection, id, modules);
    await connection.commit();
    res.status(201).json({ id });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un área con ese nombre' });
    next(error);
  } finally {
    connection.release();
  }
});

accessControlRouter.patch('/access-areas/:id', authRequired, administratorOnly, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const [[area]] = await connection.query('SELECT id FROM access_areas WHERE id = ?', [req.params.id]);
    if (!area) return res.status(404).json({ error: 'Área no encontrada' });
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'module_codes')
      && normalizedModules(req.body.module_codes).length === MODULE_CODES.length) {
      return res.status(400).json({ error: 'Sólo los administradores pueden tener acceso a todos los módulos' });
    }

    const fields = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      const name = String(req.body.name || '').trim();
      if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Nombre de área no válido' });
      fields.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'description')) {
      fields.description = String(req.body.description || '').trim() || null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active')) {
      fields.is_active = req.body.is_active === true || req.body.is_active === 1 || req.body.is_active === '1';
    }

    await connection.beginTransaction();
    const columns = Object.keys(fields);
    if (columns.length) {
      await connection.query(
        `UPDATE access_areas SET ${columns.map((column) => `\`${column}\` = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((column) => fields[column]), req.params.id]
      );
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'module_codes')) {
      await replaceAreaModules(connection, req.params.id, normalizedModules(req.body.module_codes));
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un área con ese nombre' });
    next(error);
  } finally {
    connection.release();
  }
});

accessControlRouter.patch('/users/:id/access-area', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const target = await findProfile(req.params.id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const areaId = req.body?.access_area_id || null;
    if (areaId) {
      const [[area]] = await pool.query('SELECT id FROM access_areas WHERE id = ? AND is_active = 1', [areaId]);
      if (!area) return res.status(400).json({ error: 'El área seleccionada no existe o está inactiva' });
    }
    await pool.query('UPDATE user_profiles SET access_area_id = ? WHERE id = ?', [areaId, target.id]);
    res.json({ profile: await findProfile(target.id) });
  } catch (error) {
    next(error);
  }
});
