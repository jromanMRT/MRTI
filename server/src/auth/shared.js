import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { JWT_SECRET } from '../config/security.js';
import { getPhysicalArea } from '../infraClient.js';
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '7d';

export const PROFILE_COLUMNS = 'id, user_number, email, full_name, role, access_area_id, physical_area_id, avatar_url, is_active, created_at, updated_at';
export const USER_ROLES = ['administrator', 'supervisor', 'technician', 'viewer'];
export const USER_MANAGERS = ['administrator', 'supervisor'];
export const MODULE_CODES = ['mrti-obs', 'tickets', 'agent-core', 'activos', 'rh'];
const LEGACY_MODULE_ALIASES = { 'mrti-infra': 'mrti-obs' };

export function normalizeModuleCodes(moduleCodes = []) {
  return [...new Set(moduleCodes.map((code) => LEGACY_MODULE_ALIASES[code] || code))]
    .filter((code) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code));
}

export function normalizeProfile(profile) {
  return profile ? { ...profile, is_active: Boolean(profile.is_active) } : null;
}

// authorizationHeader es opcional: se reenvía a MRTI-Obs para resolver el
// nombre del área física/piso/edificio/sitio (topología, propiedad de
// módulo de observabilidad. Sin ese header, o si MRTI-Obs no responde, esos
// campos quedan en null; nunca se rompe el perfil
// por eso.
export async function findProfile(userId, authorizationHeader) {
  const [rows] = await pool.query(
    `SELECT p.id, p.user_number, p.email, p.full_name, p.role, p.access_area_id,
            p.physical_area_id, p.avatar_url, p.is_active, p.created_at, p.updated_at,
            a.name AS access_area_name
       FROM user_profiles p
       LEFT JOIN access_areas a ON a.id = p.access_area_id AND a.is_active = 1
      WHERE p.id = ?`,
    [userId]
  );
  const profile = normalizeProfile(rows[0] || null);
  if (!profile) return null;

  const physicalArea = await getPhysicalArea(profile.physical_area_id, authorizationHeader);
  profile.physical_area_name = physicalArea?.name ?? null;
  profile.physical_floor_name = physicalArea?.floor_name ?? null;
  profile.physical_building_name = physicalArea?.building_name ?? null;
  profile.physical_site_id = physicalArea?.site_id ?? null;
  profile.physical_site_name = physicalArea?.site_name ?? null;
  if (profile.role === 'administrator') {
    const [applications] = await pool.query("SELECT code FROM applications WHERE status <> 'inactive' ORDER BY sort_order, name");
    profile.allowed_modules = normalizeModuleCodes(applications.map(({ code }) => code));
    return profile;
  }
  const [modules] = await pool.query(
    `SELECT aam.module_code
       FROM access_area_modules aam
       INNER JOIN access_areas a ON a.id = aam.area_id AND a.is_active = 1
      WHERE aam.area_id = ?`,
    [profile.access_area_id]
  );
  profile.allowed_modules = normalizeModuleCodes(
    modules.map(({ module_code: moduleCode }) => moduleCode)
  );
  return profile;
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Requiere JWT válido y una cuenta activa; adjunta el perfil a req.user.
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const profile = await findProfile(payload.sub, header);
    if (!profile || !profile.is_active) {
      return res.status(401).json({ error: 'Usuario inválido o inactivo' });
    }
    req.user = profile;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

export function moduleAccessRequired(moduleCode) {
  return (req, res, next) => {
    if (req.user?.role === 'administrator' || req.user?.allowed_modules?.includes(moduleCode)) {
      return next();
    }
    return res.status(403).json({
      error: 'Tu área no tiene acceso a este módulo',
      code: 'MODULE_FORBIDDEN',
      module: moduleCode,
    });
  };
}
