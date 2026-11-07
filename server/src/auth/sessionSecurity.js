import { createHash } from 'node:crypto';
import { pool } from '../db.js';

export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export async function sessionIsCurrent(token, payload, profile) {
  if (!profile?.is_active || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)) return false;
  const version = payload.sv ?? 0;
  if (!Number.isInteger(version) || version !== Number(profile.session_version)) return false;
  const [[revoked]] = await pool.query('SELECT token_hash FROM revoked_session_tokens WHERE token_hash = ? LIMIT 1', [tokenHash(token)]);
  return !revoked;
}

export async function revokeToken(token, payload) {
  await pool.query('INSERT IGNORE INTO revoked_session_tokens (token_hash, expires_at) VALUES (?, FROM_UNIXTIME(?))', [tokenHash(token), payload.exp]);
  // Only expired deny-list entries; business/audit records are never removed.
  await pool.query('DELETE FROM revoked_session_tokens WHERE expires_at < NOW() LIMIT 100');
}
