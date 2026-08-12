import { pool } from './db.js';

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const filtered = Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !/password|token|secret/i.test(key))
  );
  return JSON.stringify(filtered).slice(0, 8000);
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
