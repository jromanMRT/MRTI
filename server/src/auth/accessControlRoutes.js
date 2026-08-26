import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, findProfile } from './shared.js';
import { recordAudit } from '../audit.js';
import { getPhysicalArea, listPhysicalAreas } from '../infraClient.js';
import { listAssignableAssets, setPrimaryAsset } from '../assetsClient.js';

export const accessControlRouter = Router();

const FALLBACK_MODULE_CATALOG = [
  { code: 'mrti-obs', name: 'MRTI-Obs' },
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

async function moduleCatalog() {
  try {
    const [rows] = await pool.query(
      "SELECT code, name FROM applications WHERE status <> 'inactive' ORDER BY sort_order, name"
    );
    return rows.length ? rows : FALLBACK_MODULE_CATALOG;
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') return FALLBACK_MODULE_CATALOG;
    throw error;
  }
}

async function normalizedModules(value) {
  if (!Array.isArray(value)) return [];
  const validCodes = new Set((await moduleCatalog()).map(({ code }) => code));
  return [...new Set(value.map(String))].filter((code) => validCodes.has(code));
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

accessControlRouter.get('/access-control', authRequired, administratorOnly, async (req, res, next) => {
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
              p.physical_area_id, p.password_change_required, p.is_active, a.name AS access_area_name
         FROM user_profiles p
         LEFT JOIN access_areas a ON a.id = p.access_area_id
        ORDER BY p.user_number`
    );
    // Topología física y dispositivos monitoreados son de MRTI-Obs (Fase 3 de
    // CORE_INFRA_MIGRATION_GUIDE.md): se piden por su API de autoservicio en
    // vez de por SQL directo. physical_area_name se resuelve en memoria para
    // no hacer una llamada HTTP por usuario.
    const authorizationHeader = req.headers.authorization;
    const [physicalAreas, devices] = await Promise.all([
      listPhysicalAreas(authorizationHeader),
      listAssignableAssets(authorizationHeader),
    ]);
    const physicalAreaNameById = new Map(physicalAreas.map((area) => [area.id, area.name]));
    res.json({
      modules: await moduleCatalog(),
      areas: areas.map((area) => ({
        ...area,
        is_active: Boolean(area.is_active),
        module_codes: area.module_codes ? area.module_codes.split(',') : [],
      })),
      users: users.map((user) => ({
        ...user,
        is_active: Boolean(user.is_active),
        password_change_required: Boolean(user.password_change_required),
        physical_area_name: physicalAreaNameById.get(user.physical_area_id) ?? null,
      })),
      physical_areas: physicalAreas,
      devices,
    });
  } catch (error) {
    next(error);
  }
});

accessControlRouter.patch('/users/:id/location', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization;
    const target = await findProfile(req.params.id, authorizationHeader);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    const physicalAreaId = req.body?.physical_area_id || null;
    const primaryDeviceId = req.body?.primary_device_id || null;

    if (physicalAreaId) {
      const area = await getPhysicalArea(physicalAreaId, authorizationHeader);
      if (!area) return res.status(400).json({ error: 'El área física no existe o está inactiva' });
    }
    if (primaryDeviceId) {
      if (!physicalAreaId) {
        return res.status(400).json({ error: 'El equipo habitual debe pertenecer al área física del usuario' });
      }
      const areaDevices = (await listAssignableAssets(authorizationHeader))
        .filter((asset) => asset.area_id === physicalAreaId);
      const device = areaDevices.find((d) => d.id === primaryDeviceId);
      if (!device) {
        return res.status(400).json({ error: 'El equipo habitual no existe, está inactivo o no pertenece al área' });
      }
      if (device.assigned_user_id && device.assigned_user_id !== target.id) {
        return res.status(409).json({ error: 'Ese equipo ya está vinculado a otro usuario' });
      }
    }

    await pool.query('UPDATE user_profiles SET physical_area_id = ? WHERE id = ?', [physicalAreaId, target.id]);
    try {
      await setPrimaryAsset({
        userId: target.id,
        assetId: primaryDeviceId,
        userName: target.full_name,
        authorizationHeader,
      });
    } catch (deviceError) {
      // El área (Core) y el activo (Activos) viven en sistemas distintos: si
      // Activos rechaza la asignación, se revierte el área en Core.
      await pool.query('UPDATE user_profiles SET physical_area_id = ? WHERE id = ?', [target.physical_area_id, target.id]);
      if (deviceError.status) return res.status(deviceError.status).json({ error: deviceError.message });
      throw deviceError;
    }
    await recordAudit({ req, action: 'user.location_changed', entityType: 'user', entityId: target.id, metadata: { physical_area_id: physicalAreaId, primary_asset_id: primaryDeviceId } });
    res.json({ profile: await findProfile(target.id, authorizationHeader) });
  } catch (error) {
    next(error);
  }
});

accessControlRouter.get('/module-access/:moduleCode', authRequired, (req, res) => {
  const requestedCode = String(req.params.moduleCode || '');
  const moduleCode = requestedCode === 'mrti-infra' ? 'mrti-obs' : requestedCode;
  pool.query("SELECT code FROM applications WHERE code = ? AND status <> 'inactive'", [moduleCode])
    .then(([rows]) => {
      if (!rows.length) return res.status(404).json({ error: 'Módulo no encontrado' });
      if (req.user.role !== 'administrator' && !req.user.allowed_modules?.includes(moduleCode)) {
        return res.status(403).json({ error: 'Tu área no tiene acceso a este módulo', code: 'MODULE_FORBIDDEN' });
      }
      return res.status(204).end();
    })
    .catch((error) => {
      if (error?.code === 'ER_NO_SUCH_TABLE') {
        if (!FALLBACK_MODULE_CATALOG.some(({ code }) => code === moduleCode)) return res.status(404).json({ error: 'Módulo no encontrado' });
        if (req.user.role !== 'administrator' && !req.user.allowed_modules?.includes(moduleCode)) return res.status(403).json({ error: 'Tu área no tiene acceso a este módulo', code: 'MODULE_FORBIDDEN' });
        return res.status(204).end();
      }
      return res.status(500).json({ error: 'No fue posible validar el módulo' });
    });
});

accessControlRouter.post('/access-areas', authRequired, administratorOnly, async (req, res, next) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim() || null;
  const modules = await normalizedModules(req.body?.module_codes);
  if (name.length < 2 || name.length > 120) {
    return res.status(400).json({ error: 'El nombre del área debe tener entre 2 y 120 caracteres' });
  }
  if (modules.length === (await moduleCatalog()).length) {
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
    await recordAudit({ req, action: 'access_area.created', entityType: 'access_area', entityId: id, metadata: { name, module_codes: modules } });
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
    const requestedModules = Object.prototype.hasOwnProperty.call(req.body || {}, 'module_codes')
      ? await normalizedModules(req.body.module_codes)
      : null;
    if (requestedModules && requestedModules.length === (await moduleCatalog()).length) {
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
      await replaceAreaModules(connection, req.params.id, requestedModules);
    }
    await connection.commit();
    await recordAudit({ req, action: 'access_area.updated', entityType: 'access_area', entityId: req.params.id, metadata: { fields: [...columns, ...(requestedModules ? ['module_codes'] : [])] } });
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
    await recordAudit({ req, action: 'user.access_area_changed', entityType: 'user', entityId: target.id, metadata: { access_area_id: areaId } });
    res.json({ profile: await findProfile(target.id) });
  } catch (error) {
    next(error);
  }
});
