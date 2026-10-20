import { pool } from '../db.js';

const MAX_ARCHIVE_BATCH = 50;
const DEFAULT_PAGE_SIZE = 30;

export async function archiveNotifications(userId, items) {
  const valid = items
    .filter((item) => item.id && item.title)
    .slice(0, MAX_ARCHIVE_BATCH);
  if (!valid.length) return 0;
  const values = valid.flatMap((item) => [
    userId,
    String(item.id).slice(0, 190),
    String(item.kind || '').slice(0, 60) || null,
    String(item.module_code || '').slice(0, 30) || null,
    String(item.title).slice(0, 255),
    String(item.message || '').slice(0, 500) || null,
    String(item.href || '').slice(0, 500) || null,
    item.requisition_id ? JSON.stringify({ requisition_id: item.requisition_id }) : null,
  ]);
  const placeholders = valid.map(() => '(?,?,?,?,?,?,?,?)').join(',');
  const [result] = await pool.query(
    `INSERT IGNORE INTO notification_history
       (user_id, notification_id, kind, module_code, title, message, href, metadata_json)
     VALUES ${placeholders}`,
    values
  );
  return result.affectedRows;
}

export async function listNotificationHistory(userId, { before, limit } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), 100);
  const params = [userId];
  let where = 'WHERE user_id = ?';
  if (before) {
    where += ' AND id < ?';
    params.push(Number(before));
  }
  params.push(pageSize + 1);
  const [rows] = await pool.query(
    `SELECT id, notification_id, kind, module_code, title, message, href, metadata_json, archived_at
       FROM notification_history ${where}
      ORDER BY id DESC LIMIT ?`,
    params
  );
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize).map((row) => ({
    id: row.notification_id,
    kind: row.kind,
    module_code: row.module_code,
    title: row.title,
    message: row.message,
    href: row.href,
    metadata: row.metadata_json,
    archived_at: row.archived_at,
    cursor: row.id,
  }));
  return { items, has_more: hasMore };
}
