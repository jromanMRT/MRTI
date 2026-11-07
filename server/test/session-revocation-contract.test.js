import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../src/db.js';
import { JWT_SECRET } from '../src/config/security.js';
import { tokenHash } from '../src/auth/sessionSecurity.js';

const base = process.env.CONTRACT_TEST_URL || `http://127.0.0.1:${process.env.PORT || 3005}`;
test('published auth revokes logout, password reset and deactivated sessions without reviving them', async () => {
  const id = randomUUID();
  const email = `security-${id}@contract.test`;
  const originalPassword = `Original-${randomUUID()}`;
  const replacement = `Replacement-${randomUUID()}`;
  const tokens = [];
  async function request(path, token, method = 'GET', body) {
    return fetch(`${base}/api/auth${path}`, { method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json',
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function login(password) {
    const response = await request('/login', null, 'POST', { email, password });
    assert.equal(response.status, 200);
    const { token } = await response.json(); tokens.push(token); return token;
  }
  try {
    await pool.query('INSERT INTO user_profiles (id,email,password_hash,full_name,role,is_active) VALUES (?,?,?,?,?,1)',
      [id, email, await bcrypt.hash(originalPassword, 10), 'Security disposable fixture', 'administrator']);
    const legacy = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: '10m' }); tokens.push(legacy);
    assert.equal((await request('/identity', legacy)).status, 200);
    const first = await login(originalPassword);
    const second = await login(originalPassword);
    assert.notEqual(first, second);
    assert.equal((await request('/logout', first, 'POST')).status, 204);
    assert.equal((await request('/identity', first)).status, 401);
    assert.equal((await request('/identity', second)).status, 200);
    const changed = await request('/profile/password', second, 'PATCH', { current_password: originalPassword, new_password: replacement });
    assert.equal(changed.status, 200);
    const { token: renewed } = await changed.json(); tokens.push(renewed);
    for (const old of [first, second, legacy]) assert.equal((await request('/identity', old)).status, 401);
    assert.equal((await request('/identity', renewed)).status, 200);
    const reset = `Reset-${randomUUID()}`;
    assert.equal((await request(`/users/${id}`, renewed, 'PATCH', { password: reset })).status, 200);
    assert.equal((await request('/identity', renewed)).status, 401);
    const afterReset = await login(reset);
    assert.equal((await request(`/users/${id}`, afterReset, 'PATCH', { is_active: false })).status, 200);
    assert.equal((await request('/identity', afterReset)).status, 401);
    await pool.query('UPDATE user_profiles SET is_active = 1 WHERE id = ?', [id]);
    assert.equal((await request('/identity', afterReset)).status, 401);
  } finally {
    for (const token of tokens) await pool.query('DELETE FROM revoked_session_tokens WHERE token_hash = ?', [tokenHash(token)]);
    await pool.query('DELETE FROM audit_events WHERE actor_user_id = ? OR actor_email = ? OR entity_id = ?', [id, email, id]);
    await pool.query('DELETE FROM user_profiles WHERE id = ?', [id]);
    await pool.end();
  }
});
