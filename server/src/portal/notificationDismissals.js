import { pool } from '../db.js';

const MAX_DISMISS_BATCH = 50;

// Combina id + kind cuando existe (hoy sólo los avisos de tickets traen
// "kind") para que descartar un aviso no oculte para siempre una versión
// más urgente del mismo recurso -- ej. "asignado" vs "asignado, SLA vencido"
// son la misma id de ticket pero distinto kind, así que son llaves distintas.
export function dismissKeyFor({ id, kind }) {
  const base = String(id || '').trim();
  if (!base) return null;
  const suffix = String(kind || '').trim();
  return suffix ? `${base}::${suffix}` : base;
}

export async function fetchDismissedKeys(userId) {
  const [rows] = await pool.query('SELECT dismiss_key FROM notification_dismissals WHERE user_id = ?', [userId]);
  return new Set(rows.map((row) => row.dismiss_key));
}

export async function dismissNotifications(userId, items) {
  const keys = [...new Set(items.map(dismissKeyFor).filter(Boolean))].slice(0, MAX_DISMISS_BATCH);
  if (!keys.length) return 0;
  await pool.query(
    `INSERT IGNORE INTO notification_dismissals (user_id, dismiss_key) VALUES ${keys.map(() => '(?, ?)').join(',')}`,
    keys.flatMap((key) => [userId, key])
  );
  return keys.length;
}
