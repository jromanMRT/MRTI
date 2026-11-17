import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHoneypotHandler, isHoneypotPath } from '../src/security/honeypot.js';

function response() {
  return {
    statusCode: 200,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test('honeypot accepts only known decoy paths without query strings', () => {
  for (const pathname of ['/wp-admin/', '/wp-login.php', '/phpmyadmin/', '/adminer.php', '/server-status', '/actuator/env', '/cgi-bin/test.cgi']) {
    assert.equal(isHoneypotPath(pathname), true, pathname);
  }
  for (const pathname of ['/admin/', '/.env', '/wp-admin?x=1', '/wp-admin#fragment', '/wp-admin/\n']) {
    assert.equal(isHoneypotPath(pathname), false, pathname);
  }
});

test('honeypot records minimal metadata and still responds 404', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mrti-honeypot-'));
  const eventFile = path.join(directory, 'events.jsonl');
  try {
    const handler = createHoneypotHandler({
      eventFile,
      now: () => new Date('2026-11-09T18:00:00.000Z'),
      createId: () => 'event-uuid',
    });
    const req = {
      method: 'GET',
      ip: '192.0.2.10',
      get(name) {
        return { 'X-Honeypot-Path': '/wp-admin/', 'X-Request-Id': 'request-12345678' }[name];
      },
      body: { password: 'must-not-be-recorded' },
      headers: { 'user-agent': 'must-not-be-recorded' },
    };
    const res = response();

    await handler(req, res);

    assert.equal(res.statusCode, 404);
    assert.equal(res.ended, true);
    const [line] = (await readFile(eventFile, 'utf8')).trim().split('\n');
    assert.deepEqual(JSON.parse(line), {
      id: 'event-uuid',
      timestamp: '2026-11-09T18:00:00.000Z',
      event: 'security.honeypot_hit',
      requestId: 'request-12345678',
      method: 'GET',
      path: '/wp-admin/',
      sourceIp: '192.0.2.10',
    });
    assert.equal((await stat(eventFile)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('honeypot ignores untrusted target paths and reports storage failures', async () => {
  const errors = [];
  const handler = createHoneypotHandler({
    eventFile: '/dev/null/not-a-log',
    onWriteError: (error) => errors.push(error),
  });
  const req = { method: 'POST', ip: '192.0.2.11', get: () => '/admin/' };
  const ignored = response();
  await handler(req, ignored);
  assert.equal(ignored.statusCode, 404);
  assert.equal(errors.length, 0);

  req.get = () => '/wp-login.php';
  const failed = response();
  await handler(req, failed);
  assert.equal(failed.statusCode, 503);
  assert.equal(errors.length, 1);
});
