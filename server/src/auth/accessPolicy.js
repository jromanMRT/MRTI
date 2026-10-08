import { pool } from '../db.js';
import { PERMISSION_CATALOG, LEVELS } from '../vendor/mrti-platform/permissions.js';

export const parsePolicy = (value) => typeof value === 'string' ? JSON.parse(value) : (value || {});
export function validatePolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La política debe ser un objeto');
  const clean = {};
  for (const [code, rule] of Object.entries(value)) {
    const module = PERMISSION_CATALOG.find((m) => m.code === code);
    if (!module || !rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('Módulo o regla no válida');
    if (Object.keys(rule).some((key) => !['access','level','sections'].includes(key))) throw new Error('Campo de permiso desconocido');
    const normalized = {};
    if (rule.access !== undefined) {
      if (typeof rule.access !== 'boolean') throw new Error('Acceso debe ser permitido o denegado');
      normalized.access = rule.access;
    }
    if (rule.level !== undefined) {
      if (!LEVELS.includes(rule.level)) throw new Error('Nivel no válido');
      normalized.level = rule.level;
    }
    if (rule.sections !== undefined) {
      if (!rule.sections || typeof rule.sections !== 'object' || Array.isArray(rule.sections)) throw new Error('Secciones no válidas');
      normalized.sections = {};
      for (const [id, level] of Object.entries(rule.sections)) {
        if (!module.sections.some((s) => s.id === id) || !LEVELS.includes(level)) throw new Error('Sección o nivel no válido');
        normalized.sections[id] = level;
      }
      if (!Object.keys(normalized.sections).length) delete normalized.sections;
    }
    if (Object.keys(normalized).length) clean[code] = normalized;
  }
  return clean;
}
export function combinePolicies(role = {}, user = {}) {
  return Object.fromEntries([...new Set([...Object.keys(role), ...Object.keys(user)])].map((code) => [code, {
    ...role[code], ...user[code], sections: { ...role[code]?.sections, ...user[code]?.sections },
  }]));
}
export function applyPolicy(profile, rolePolicy, userPolicy, activeCodes) {
  if (profile.role === 'administrator') return { ...profile, access_policy: {}, access_policy_version: 1 };
  const policy = combinePolicies(rolePolicy, userPolicy);
  const modules = new Set(profile.allowed_modules);
  for (const [code, config] of Object.entries(policy)) {
    if (config.access === false) modules.delete(code);
    else if (config.access === true && activeCodes.includes(code)) modules.add(code);
    if (config.level === 'none' && !Object.values(config.sections).some((v) => v !== 'none')) modules.delete(code);
  }
  return { ...profile, allowed_modules: [...modules].filter((code) => activeCodes.includes(code)), access_policy: policy, access_policy_version: 1 };
}
export async function attachAccessPolicy(profile) {
  if (profile.role === 'administrator') return { ...profile, access_policy: {}, access_policy_version: 1 };
  const [rows] = await pool.query('SELECT subject_type, policy_json FROM access_policies WHERE (subject_type = ? AND subject_id = ?) OR (subject_type = ? AND subject_id = ?)', ['role', profile.role, 'user', profile.id]);
  const [apps] = await pool.query("SELECT code FROM applications WHERE status <> 'inactive'");
  const forType = (type) => parsePolicy(rows.find((row) => row.subject_type === type)?.policy_json);
  return applyPolicy(profile, forType('role'), forType('user'), apps.map((row) => row.code));
}
