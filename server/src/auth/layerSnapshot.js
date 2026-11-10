import { pool } from '../db.js';
import { propagationHeaders } from '../vendor/mrti-platform/request-context.js';
import { ORGANIZATIONAL_LAYERS } from './accessPolicy.js';

// La capa organizacional pertenece a RH. Core la consulta con el token del
// propio usuario (datos propios por autoservicio, sin credencial de servicio)
// y guarda una instantánea para que `authRequired` nunca llame a otro
// servicio: RH valida sesiones contra Core y una llamada en línea cerraría
// un ciclo Core→RH→Core. Sólo se refresca desde rutas que el navegador invoca
// (login, /identity), nunca desde /me ni /module-access.
const RH_URL = process.env.MRTI_RH_URL || 'http://127.0.0.1:3004';
const STALE_AFTER_MS = Number(process.env.ACCESS_LAYER_REFRESH_MS || 10 * 60 * 1000);
const inFlight = new Map();

async function fetchLayerFromRh(authorization) {
  const response = await fetch(`${RH_URL}/api/rh-self/me/organizational-layer`, {
    headers: propagationHeaders({ Authorization: authorization }),
    signal: AbortSignal.timeout(4000),
  });
  if (response.status === 404) return { layer: null, position_id: null, position_name: null };
  if (!response.ok) throw new Error(`RH respondió HTTP ${response.status}`);
  const body = await response.json().catch(() => ({}));
  const data = body?.data || {};
  const layer = ORGANIZATIONAL_LAYERS.includes(data.position_level) ? data.position_level : null;
  return { layer, position_id: data.position_id ?? null, position_name: data.position_name || null };
}

export async function refreshLayerSnapshot(userId, authorization) {
  if (!userId || !authorization) return null;
  if (inFlight.has(userId)) return inFlight.get(userId);
  const task = (async () => {
    const snapshot = await fetchLayerFromRh(authorization);
    await pool.query(
      `INSERT INTO access_layer_snapshot (user_id, layer, position_id, position_name) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE layer = VALUES(layer), position_id = VALUES(position_id), position_name = VALUES(position_name), synced_at = CURRENT_TIMESTAMP`,
      [userId, snapshot.layer, snapshot.position_id, snapshot.position_name]
    );
    return snapshot;
  })().finally(() => inFlight.delete(userId));
  inFlight.set(userId, task);
  return task;
}

// Mejor esfuerzo: nunca bloquea ni falla la petición que lo dispara. Si RH no
// responde se conserva la instantánea anterior y se registra el motivo.
export function refreshLayerSnapshotQuietly(userId, authorization, { force = false, syncedAt = null } = {}) {
  if (!force && syncedAt && Date.now() - new Date(syncedAt).getTime() < STALE_AFTER_MS) return Promise.resolve(null);
  return refreshLayerSnapshot(userId, authorization).catch((error) => {
    console.warn('[access-layer] no se pudo refrescar la capa organizacional', { user: userId, error: String(error?.message || error) });
    return null;
  });
}
