import { pool } from '../db.js';
import { PERMISSION_CATALOG, LEVELS } from '../vendor/mrti-platform/permissions.js';

export const parsePolicy = (value) => typeof value === 'string' ? JSON.parse(value) : (value || {});
export const ROLE_DEFAULT_LEVELS = {
  area_manager: 'write',
  data_entry: 'write',
  approver: 'read',
  auditor: 'read',
};
// Capas organizacionales definidas por RH (decisión 2026-11-09). Core no las
// calcula: sólo acepta estos identificadores como sujeto de política.
export const ORGANIZATIONAL_LAYERS = ['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6'];
export const ORGANIZATIONAL_LAYER_LABELS = {
  'C-1': 'C-1 Administración general',
  'C-2': 'C-2 Dirección',
  'C-3': 'C-3 Gerencia, Contraloría y Superintendencia',
  'C-4': 'C-4 Jefatura, Coordinación y Supervisión',
  'C-5': 'C-5 Profesional, Especialista y Administrativo',
  'C-6': 'C-6 Operativo, Auxiliar y Servicios',
};
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
// Orden de precedencia (de menor a mayor): nivel inicial del rol → política de
// la capa organizacional → política del rol → excepción del usuario. La capa
// es un valor por defecto amplio; lo que un administrador configuró para un rol
// o una cuenta concreta siempre prevalece.
export function applyPolicy(profile, rolePolicy, userPolicy, activeCodes, layerPolicy = {}) {
  if (profile.role === 'administrator') return { ...profile, access_policy: {}, access_policy_version: 1 };
  const defaultLevel = ROLE_DEFAULT_LEVELS[profile.role];
  const defaults = defaultLevel ? Object.fromEntries(activeCodes.map((code) => [code, { level: defaultLevel }])) : {};
  const policy = combinePolicies(combinePolicies(combinePolicies(defaults, layerPolicy), rolePolicy), userPolicy);
  const modules = new Set(profile.allowed_modules);
  for (const [code, config] of Object.entries(policy)) {
    if (config.access === false) modules.delete(code);
    else if (config.access === true && activeCodes.includes(code)) modules.add(code);
    if (config.level === 'none' && !Object.values(config.sections).some((v) => v !== 'none')) modules.delete(code);
  }
  return { ...profile, allowed_modules: [...modules].filter((code) => activeCodes.includes(code)), access_policy: policy, access_policy_version: 1 };
}
export async function findLayerSnapshot(userId) {
  const [[row]] = await pool.query('SELECT layer, position_id, position_name, synced_at FROM access_layer_snapshot WHERE user_id = ?', [userId]);
  if (!row) return null;
  return { layer: row.layer || null, position_id: row.position_id ?? null, position_name: row.position_name || null, synced_at: row.synced_at };
}
export async function attachAccessPolicy(profile) {
  const snapshot = await findLayerSnapshot(profile.id);
  const withLayer = { ...profile, organizational_layer: snapshot };
  if (profile.role === 'administrator') return { ...withLayer, access_policy: {}, access_policy_version: 1 };
  const layer = ORGANIZATIONAL_LAYERS.includes(snapshot?.layer) ? snapshot.layer : null;
  const [rows] = await pool.query(
    `SELECT subject_type, policy_json FROM access_policies
      WHERE (subject_type = 'role' AND subject_id = ?) OR (subject_type = 'user' AND subject_id = ?)
         OR (subject_type = 'layer' AND subject_id = ?)`,
    [profile.role, profile.id, layer ?? '']
  );
  const [apps] = await pool.query("SELECT code FROM applications WHERE status <> 'inactive'");
  const forType = (type) => parsePolicy(rows.find((row) => row.subject_type === type)?.policy_json);
  return applyPolicy(withLayer, forType('role'), forType('user'), apps.map((row) => row.code), forType('layer'));
}
