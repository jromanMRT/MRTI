import { randomUUID } from 'node:crypto';
import { open, mkdir } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_EVENT_FILE = fileURLToPath(new URL('../../../../run/security/honeypot-events.jsonl', import.meta.url));
const MAX_PATH_LENGTH = 256;
const DECOY_PATH = /^\/(?:wp-admin(?:\/|$)|wp-login\.php$|phpmyadmin(?:\/|$)|adminer(?:\.php)?$|server-status$|actuator(?:\/|$)|cgi-bin(?:\/|$))/i;
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function isHoneypotPath(value) {
  return typeof value === 'string'
    && value.length <= MAX_PATH_LENGTH
    && !/[?#\u0000-\u001f\u007f]/.test(value)
    && DECOY_PATH.test(value);
}

export function createHoneypotHandler({
  eventFile = process.env.MRTI_SECURITY_EVENTS_FILE || DEFAULT_EVENT_FILE,
  now = () => new Date(),
  createId = randomUUID,
  onWriteError = (error) => console.error('[honeypot] no fue posible registrar el evento:', error.message),
} = {}) {
  return async function honeypotHandler(req, res) {
    const targetPath = req.get('X-Honeypot-Path');
    if (!isHoneypotPath(targetPath)) return res.status(404).end();

    const forwardedRequestId = req.get('X-Request-Id');
    const event = {
      id: createId(),
      timestamp: now().toISOString(),
      event: 'security.honeypot_hit',
      requestId: forwardedRequestId && VALID_REQUEST_ID.test(forwardedRequestId)
        ? forwardedRequestId
        : createId(),
      method: /^[A-Z]{3,8}$/.test(req.method) ? req.method : 'UNKNOWN',
      path: targetPath,
      sourceIp: isIP(req.ip) ? req.ip : 'unknown',
    };

    try {
      await mkdir(path.dirname(eventFile), { recursive: true, mode: 0o700 });
      const file = await open(eventFile, 'a', 0o600);
      try {
        await file.chmod(0o600);
        await file.appendFile(`${JSON.stringify(event)}\n`, 'utf8');
      } finally {
        await file.close();
      }
    } catch (error) {
      onWriteError(error);
      return res.status(503).end();
    }

    return res.status(404).end();
  };
}
