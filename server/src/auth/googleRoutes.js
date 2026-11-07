import { Router } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../db.js';
import { signToken, normalizeProfile } from './shared.js';
import {
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_SSO_ENABLED,
  GOOGLE_ALLOWED_DOMAIN, GOOGLE_JIT_ENABLED,
} from '../config/security.js';
import { recordAudit } from '../audit.js';
import { createOneTimeStore, randomSecret, safeReturnTo, readCookie, sameSecret,
  validateGoogleIdentity, canLinkGoogleAccount } from './oauthSecurity.js';

export const googleRouter = Router();
const flows = createOneTimeStore({ ttlMs: 10 * 60_000 });
const completions = createOneTimeStore({ ttlMs: 60_000 });
const callback = new URL(GOOGLE_REDIRECT_URI);
const secure = callback.protocol === 'https:';
const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth/google' };
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
const buildClient = () => new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
const failed = (res) => res.redirect('/login?error=' + encodeURIComponent('No se pudo completar el acceso. Inicia nuevamente o contacta al administrador.'));

googleRouter.get('/sso-status', (_req, res) => res.json({ google: GOOGLE_SSO_ENABLED }));
googleRouter.use('/google', limiter, (_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  next();
});

googleRouter.get('/google', async (req, res, next) => {
  if (!GOOGLE_SSO_ENABLED) return res.status(503).json({ error: 'Google SSO no está configurado' });
  const returnTo = safeReturnTo(req.query.returnTo);
  // Start and finish on the configured origin so the browser-bound cookie
  // survives the callback, including when access started on the LAN IP.
  if (req.get('host') !== callback.host) {
    return res.redirect(`${callback.origin}/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
  }
  try {
    const browser = randomSecret();
    const verifier = randomSecret();
    const nonce = randomSecret();
    const state = flows.put({ browser, verifier, nonce, returnTo });
    res.cookie('mrti_oauth_browser', browser, { ...cookieOptions, maxAge: 10 * 60_000 });
    res.redirect(buildClient().generateAuthUrl({
      access_type: 'online', scope: ['openid', 'email', 'profile'], prompt: 'select_account',
      state, nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }));
  } catch (error) { next(error); }
});

googleRouter.get('/google/callback', async (req, res) => {
  if (!GOOGLE_SSO_ENABLED) return res.status(503).json({ error: 'Google SSO no está configurado' });
  const flow = flows.take(req.query.state);
  const browser = readCookie(req, 'mrti_oauth_browser');
  res.clearCookie('mrti_oauth_browser', cookieOptions);
  if (!flow || !sameSecret(browser, flow.browser) || typeof req.query.code !== 'string') return failed(res);
  try {
    const client = buildClient();
    const { tokens } = await client.getToken({ code: req.query.code, codeVerifier: flow.verifier, redirect_uri: GOOGLE_REDIRECT_URI });
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!sameSecret(payload?.nonce, flow.nonce)) return failed(res);
    const identity = validateGoogleIdentity(payload, GOOGLE_ALLOWED_DOMAIN);
    let [rows] = await pool.query('SELECT * FROM user_profiles WHERE google_sub = ? LIMIT 1', [identity.sub]);
    if (!rows.length) [rows] = await pool.query('SELECT * FROM user_profiles WHERE email = ? LIMIT 1', [identity.email]);
    let user = normalizeProfile(rows[0] || null);
    if (user && !canLinkGoogleAccount(user, identity)) return failed(res);
    if (!user && GOOGLE_JIT_ENABLED && identity.authoritativeEmail) {
      const id = randomUUID();
      await pool.query(`INSERT INTO user_profiles
        (id, email, password_hash, full_name, role, auth_provider, google_sub, is_active)
        VALUES (?, ?, NULL, ?, 'viewer', 'google', ?, 1)`,
      [id, identity.email, payload.name || identity.email.split('@')[0], identity.sub]);
      user = { id, email: identity.email, role: 'viewer', is_active: true, google_sub: identity.sub, session_version: 0 };
      await recordAudit({ req, actor: user, action: 'user.jit_provisioned', entityType: 'user', entityId: id });
    }
    if (!user?.is_active) return failed(res);
    // Atomically reject conflicting bindings, deactivation or credential reset
    // since the identity was read. Never store offline refresh tokens for login.
    const [updated] = await pool.query(`UPDATE user_profiles SET google_sub = ?, last_login_at = NOW()
      WHERE id = ? AND is_active = 1 AND session_version = ? AND (google_sub IS NULL OR google_sub = ?)`,
    [identity.sub, user.id, user.session_version, identity.sub]);
    if (!updated.affectedRows) return failed(res);
    const ticketId = completions.put({ userId: user.id, version: user.session_version, returnTo: flow.returnTo });
    res.cookie('mrti_sso_completion', ticketId, { ...cookieOptions, sameSite: 'strict', maxAge: 60_000 });
    await recordAudit({ req, actor: user, action: 'session.google_login_succeeded', entityType: 'session', entityId: user.id });
    res.redirect('/login?sso=complete');
  } catch {
    // OAuth provider errors can contain codes/tokens; never log the raw error.
    console.warn('Google OAuth login rejected');
    failed(res);
  }
});

googleRouter.post('/google/exchange', async (req, res, next) => {
  if (!GOOGLE_SSO_ENABLED) return res.sendStatus(503);
  if (req.get('origin') !== callback.origin || !req.is('application/json')) return res.sendStatus(403);
  const completion = completions.take(readCookie(req, 'mrti_sso_completion'));
  res.clearCookie('mrti_sso_completion', { ...cookieOptions, sameSite: 'strict' });
  if (!completion) return res.status(401).json({ error: 'El acceso expiró; inicia nuevamente' });
  try {
    const [[user]] = await pool.query('SELECT is_active, session_version FROM user_profiles WHERE id = ?', [completion.userId]);
    if (!user?.is_active || user.session_version !== completion.version) return res.sendStatus(401);
    res.json({ token: signToken(completion.userId, completion.version), returnTo: completion.returnTo });
  } catch (error) { next(error); }
});
