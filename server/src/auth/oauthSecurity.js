import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const randomSecret = () => randomBytes(32).toString('base64url');

export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/dashboard';
  const parsed = new URL(value, 'https://portal.invalid');
  return parsed.origin === 'https://portal.invalid' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : '/dashboard';
}

// Bounded, single-use, process-local secrets. A restart safely cancels an
// unfinished login; no identity or authorization data is cached here.
export function createOneTimeStore({ ttlMs, limit = 1000, now = Date.now } = {}) {
  const entries = new Map();
  return {
    put(value) {
      for (const [key, entry] of entries) if (entry.expires <= now()) entries.delete(key);
      if (entries.size >= limit) throw new Error('Demasiados inicios de sesión pendientes');
      const secret = randomSecret();
      entries.set(digest(secret), { value, expires: now() + ttlMs });
      return secret;
    },
    take(secret) {
      if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
      const key = digest(secret);
      const entry = entries.get(key);
      entries.delete(key);
      return entry && entry.expires > now() ? entry.value : null;
    },
  };
}

export function readCookie(req, name) {
  const matches = String(req.headers.cookie || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}

export function sameSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && /^[A-Za-z0-9_-]{43}$/.test(b)
    && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function validateGoogleIdentity(payload, domain) {
  if (!payload || payload.email_verified !== true || typeof payload.sub !== 'string' || !payload.sub
      || typeof payload.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new Error('Identidad de Google no verificada');
  }
  if (domain && String(payload.hd || '').toLowerCase() !== domain.toLowerCase()) {
    throw new Error('La cuenta no pertenece al dominio corporativo');
  }
  return { email: payload.email.toLowerCase(), sub: payload.sub,
    authoritativeEmail: Boolean(payload.hd) || payload.email.toLowerCase().endsWith('@gmail.com') };
}

export function canLinkGoogleAccount(user, identity) {
  if (user.google_sub) return user.google_sub === identity.sub;
  return identity.authoritativeEmail && user.email.toLowerCase() === identity.email;
}
