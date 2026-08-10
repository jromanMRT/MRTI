import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { JWT_SECRET } from '../config/security.js';
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '7d';

export const PROFILE_COLUMNS = 'id, user_number, email, full_name, role, access_area_id, physical_area_id, avatar_url, is_active, created_at, updated_at';
export const USER_ROLES = ['administrator', 'supervisor', 'technician', 'viewer'];
export const USER_MANAGERS = ['administrator', 'supervisor'];
export const MODULE_CODES = ['mrti-infra', 'tickets', 'agent-core', 'activos', 'rh'];

export function normalizeProfile(profile) {
  return profile ? { ...profile, is_active: Boolean(profile.is_active) } : null;
}

export async function findProfile(userId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.user_number, p.email, p.full_name, p.role, p.access_area_id,
            p.physical_area_id, p.avatar_url, p.is_active, p.created_at, p.updated_at,
            a.name AS access_area_name, pa.name AS physical_area_name,
            f.name AS physical_floor_name, b.name AS physical_building_name,
            s.id AS physical_site_id, s.name AS physical_site_name
       FROM user_profiles p
       LEFT JOIN access_areas a ON a.id = p.access_area_id AND a.is_active = 1
       LEFT JOIN areas pa ON pa.id = p.physical_area_id AND pa.is_active = 1
       LEFT JOIN floors f ON f.id = pa.floor_id
       LEFT JOIN buildings b ON b.id = f.building_id
       LEFT JOIN sites s ON s.id = b.site_id
      WHERE p.id = ?`,
    [userId]
  );
  const profile = normalizeProfile(rows[0] || null);
  if (!profile) return null;
  if (profile.role === 'administrator') {
    profile.allowed_modules = [...MODULE_CODES];
    return profile;
  }
  const [modules] = await pool.query(
    `SELECT aam.module_code
       FROM access_area_modules aam
       INNER JOIN access_areas a ON a.id = aam.area_id AND a.is_active = 1
      WHERE aam.area_id = ?`,
    [profile.access_area_id]
  );
  profile.allowed_modules = modules
    .map(({ module_code: moduleCode }) => moduleCode)
    .filter((moduleCode) => MODULE_CODES.includes(moduleCode));
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
    const profile = await findProfile(payload.sub);
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
