import { pool } from './db.js';

const SENSITIVE_KEY = /password|passphrase|token|secret|authorization|cookie|api.?key|credential|hash|curp|rfc|nss|salary|sueldo|bank|clabe|medical|health|birth.?date/i;

export function sanitizeAuditMetadata(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 5) return '[profundidad limitada]';
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAuditMetadata(item, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTADO]' : sanitizeAuditMetadata(item, depth + 1),
  ]));
}

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return JSON.stringify(sanitizeAuditMetadata(metadata)).slice(0, 8000);
}

export async function recordAudit({ req, actor = req?.user, action, entityType, entityId = null, metadata = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_events
        (actor_user_id, actor_email, action, entity_type, entity_id, ip_address, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actor?.id || null,
        actor?.email || null,
        action,
        entityType,
        entityId ? String(entityId) : null,
        req?.ip || null,
        safeMetadata(metadata),
      ]
    );
  } catch (error) {
    // La auditoría nunca debe tumbar la operación principal, pero el fallo sí
    // debe quedar visible en los logs operativos.
    console.error('No fue posible registrar auditoría:', error.message);
  }
}
