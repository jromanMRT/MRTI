import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

const BASE_URL = process.env.CONTRACT_TEST_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
const user = { id: randomUUID(), email: `workspace-${randomUUID()}@contract.test`, password: 'workspace-contract-pw' };
let token;

function request(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
}

before(async () => {
  await pool.query('INSERT INTO user_profiles (id, email, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1)', [user.id, user.email, await bcrypt.hash(user.password, 10), 'Workspace Fixture', 'viewer']);
  const response = await fetch(`${BASE_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: user.password }) });
  assert.equal(response.status, 200);
  token = (await response.json()).token;
});

after(async () => {
  await pool.query('DELETE FROM audit_events WHERE actor_user_id = ? OR entity_id = ?', [user.id, user.id]);
  await pool.query('DELETE FROM user_profiles WHERE id = ?', [user.id]);
  await pool.end();
});

test('preferencias se crean, persisten y sólo afectan al usuario autenticado', async () => {
  const initial = await request('/api/auth/profile/preferences');
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).preferences.theme, 'system');
  const updated = await request('/api/auth/profile/preferences', { method: 'PATCH', body: JSON.stringify({ theme: 'dark', density: 'compact', show_notifications: false, show_rh: true, show_assets: false, show_tickets: true }) });
  assert.equal(updated.status, 200);
  assert.deepEqual((await updated.json()).preferences, { theme: 'dark', density: 'compact', show_notifications: false, show_rh: true, show_assets: false, show_tickets: true });
  const themeOnly = await request('/api/auth/profile/preferences/theme', { method: 'PATCH', body: JSON.stringify({ theme: 'light' }) });
  assert.equal(themeOnly.status, 200);
  assert.deepEqual((await themeOnly.json()).preferences, { theme: 'light', density: 'compact', show_notifications: false, show_rh: true, show_assets: false, show_tickets: true });
});

test('foto de perfil valida firma y actualiza el perfil propio', async () => {
  const invalid = await request('/api/auth/profile/avatar', { method: 'PATCH', body: JSON.stringify({ avatar_data_url: 'data:image/png;base64,bm8tZXMtaW1hZ2Vu' }) });
  assert.equal(invalid.status, 400);
  const avatar = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64')}`;
  const valid = await request('/api/auth/profile/avatar', { method: 'PATCH', body: JSON.stringify({ avatar_data_url: avatar }) });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).profile.avatar_url, '/api/auth/profile/avatar/content');
  const content = await request('/api/auth/profile/avatar/content');
  assert.equal(content.status, 200);
  assert.equal(content.headers.get('content-type'), 'image/png');
});
