import { createCommunityRouter } from './routes.js';
import { pool } from '../db.js';
import { authRequired } from '../auth/shared.js';
import { JWT_SECRET } from '../config/security.js';
import { recordAudit } from '../audit.js';
import { fail } from './domain.js';
export const communityRouter = createCommunityRouter({
  db:pool,authRequired,secret:JWT_SECRET,audit:recordAudit,
  async fetchCalendar() {
    const base = process.env.MRTI_RH_URL || 'http://127.0.0.1:3004';
    try {
      const r = await fetch(`${base}/api/rh-public/community-calendar`,{signal:AbortSignal.timeout(5000)});
      if (!r.ok) throw new Error('calendar unavailable');
      return (await r.json()).data;
    } catch { throw fail(503,'El calendario no está disponible en este momento.'); }
  },
});
