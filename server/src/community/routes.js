import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { permissionFor, levelAllows } from '../vendor/mrti-platform/permissions.js';
import { createChallengeService, digest, fail, normalizePoll, normalizeReport, normalizeSettings, STATUSES, text } from './domain.js';

export function createCommunityRouter({ db, authRequired, secret, audit = async () => {}, fetchCalendar }) {
  const router = Router();
  const challenges = createChallengeService(secret);
  const wrap = fn => async (req,res,next) => { try { await fn(req,res); } catch (err) {
    // SQL errors contain input values. Never forward them to the global logger.
    if (!err.status) { console.error('community operation failed', { code: err.code || 'INTERNAL' }); return res.status(503).json({ error: 'Servicio temporalmente no disponible. Intenta de nuevo.' }); }
    if (err.status === 429) res.set('Retry-After', '3600');
    res.status(err.status).json({ error: err.message });
  } };
  router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  const manager = (req,res,next) => levelAllows(permissionFor(req.user,'rh','news'),req.method) ? next() : res.status(403).json({error:'Sólo RH y administradores pueden gestionar esta sección.'});
  const limiter = rateLimit({ windowMs: 15*60000, limit: 40, standardHeaders:'draft-8', legacyHeaders:false, message:{error:'Demasiados intentos. Espera 15 minutos e intenta de nuevo.'} });
  async function transaction(fn) {
    const conn = await db.getConnection();
    try { await conn.beginTransaction(); const result = await fn(conn); await conn.commit(); return result; }
    catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
  }
  router.get('/calendar', wrap(async (_req,res) => res.json({data:await fetchCalendar()})));
  router.get('/channel', wrap(async (_req,res) => {
    const [[s]] = await db.query('SELECT reports_enabled FROM community_settings WHERE id=1');
    res.json({data:{enabled:Boolean(s.reports_enabled)}});
  }));
  router.get('/challenge', limiter, wrap(async (_req,res) => res.json({data:challenges.issue()})));
  router.post('/reports', limiter, wrap(async (req,res) => {
    const report = normalizeReport(req.body);
    const nonce = challenges.verify(req.body.challenge_token, req.body.answer, req.body.website);
    const id = randomUUID(), folio = `MRT-${randomBytes(6).toString('hex').toUpperCase()}`, accessCode = randomBytes(18).toString('base64url');
    await transaction(async conn => {
      // A single row lock serializes settings + all quotas + insert across processes.
      const [[s]] = await conn.query('SELECT * FROM community_settings WHERE id=1 FOR UPDATE');
      if (!s.reports_enabled) throw fail(503,'El canal está temporalmente pausado. Intenta más tarde.');
      const [[clock]] = await conn.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d') AS day, DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d-%H') AS hour");
      const key = challenges.networkKey(ipKeyGenerator(req.ip),clock.day);
      const quotas = [[`hour:${clock.hour}:${key}`,s.hourly_limit],[`day:${key}`,s.daily_limit],[`global:${clock.day}`,s.global_daily_limit]];
      await conn.query('DELETE FROM community_rate_buckets WHERE expires_at<UTC_TIMESTAMP()');
      await conn.query('DELETE FROM community_used_challenges WHERE expires_at<UTC_TIMESTAMP()');
      const [[used]] = await conn.query('SELECT nonce FROM community_used_challenges WHERE nonce=?',[nonce]);
      if (used) throw fail(409,'Este envío ya fue procesado. No vuelvas a enviarlo.');
      for (const [bucket,limit] of quotas) {
        const [[row]] = await conn.query('SELECT hits FROM community_rate_buckets WHERE bucket_key=?',[bucket]);
        if (row && row.hits >= limit) throw fail(429,'Se alcanzó el límite de envíos del canal o de esta red. Intenta más tarde.');
        await conn.query('INSERT INTO community_rate_buckets (bucket_key,hits,expires_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY)) ON DUPLICATE KEY UPDATE hits=hits+1',[bucket]);
      }
      await conn.query('INSERT INTO community_used_challenges (nonce,expires_at) VALUES (?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 20 MINUTE))',[nonce]);
      await conn.query('INSERT INTO community_reports (id,folio,access_digest,category,subject,body) VALUES (?,?,?,?,?,?)',[id,folio,digest(accessCode),report.category,report.subject,report.body]);
    });
    // No audit call: would associate IP/session with an anonymous report.
    res.status(201).json({ data:{folio,access_code:accessCode} });
  }));
  router.post('/report-status', limiter, wrap(async (req,res) => {
    const folio = text(req.body?.folio,'Folio',24,1).toUpperCase();
    const code = text(req.body?.access_code,'Clave de consulta',64,1);
    const [[row]] = await db.query('SELECT folio,status,public_reply,updated_at FROM community_reports WHERE folio=? AND access_digest=?',[folio,digest(code)]);
    if (!row) throw fail(404,'Folio o clave de consulta incorrectos.');
    res.json({data:{...row,status:row.status==='spam'?'reviewing':row.status}});
  }));
  router.get('/polls', authRequired, wrap(async (req,res) => {
    const [rows] = await db.query(`SELECT p.id,p.question,p.options_json,DATE_FORMAT(p.closes_at,'%Y-%m-%dT%H:%i:%sZ') AS closes_at,
      v.option_index AS my_vote FROM community_polls p LEFT JOIN community_votes v ON v.poll_id=p.id AND v.user_id=?
      WHERE p.closed_at IS NULL AND p.closes_at>UTC_TIMESTAMP() ORDER BY p.created_at DESC LIMIT 30`,[req.user.id]);
    res.json({data:rows.map(r=>({...r,options:typeof r.options_json==='string'?JSON.parse(r.options_json):r.options_json,options_json:undefined}))});
  }));
  router.post('/polls/:id/vote', authRequired, wrap(async (req,res) => {
    if (!Number.isInteger(req.body?.option_index)) throw fail(400,'Selecciona una opción.');
    await transaction(async conn => {
      const [[p]] = await conn.query('SELECT options_json FROM community_polls WHERE id=? AND closed_at IS NULL AND closes_at>UTC_TIMESTAMP() FOR UPDATE',[req.params.id]);
      if (!p) throw fail(409,'La encuesta ya terminó o no está disponible.');
      const options = typeof p.options_json==='string'?JSON.parse(p.options_json):p.options_json;
      if (req.body.option_index<0 || req.body.option_index>=options.length) throw fail(400,'Opción inválida.');
      try { await conn.query('INSERT INTO community_votes (poll_id,user_id,option_index) VALUES (?,?,?)',[req.params.id,req.user.id,req.body.option_index]); }
      catch (err) { if (err.code==='ER_DUP_ENTRY') throw fail(409,'Ya participaste en esta encuesta.'); throw err; }
    });
    res.status(201).json({success:true});
  }));
  router.use('/admin', authRequired, manager);
  router.get('/admin/capabilities', wrap(async (req,res) => res.json({data:{can_write:levelAllows(permissionFor(req.user,'rh','news'),'POST')}})));
  router.get('/admin/settings', wrap(async (_req,res) => {
    const [[s]] = await db.query('SELECT * FROM community_settings WHERE id=1');
    res.json({data:{...s,reports_enabled:Boolean(s.reports_enabled)}});
  }));
  router.put('/admin/settings', wrap(async (req,res) => {
    const s = normalizeSettings(req.body);
    const [result] = await db.query('UPDATE community_settings SET reports_enabled=?,hourly_limit=?,daily_limit=?,global_daily_limit=?,revision=revision+1 WHERE id=1 AND revision=?',[s.reports_enabled,s.hourly_limit,s.daily_limit,s.global_daily_limit,Number(req.body.revision)||0]);
    if (!result.affectedRows) throw fail(409,'La configuración cambió. Recarga antes de guardar.');
    await audit({req,action:'community.settings_updated',entityType:'community_settings',entityId:'1'});
    res.json({success:true});
  }));
  router.get('/admin/polls', wrap(async (_req,res) => {
    const [rows] = await db.query(`SELECT id,question,options_json,DATE_FORMAT(closes_at,'%Y-%m-%dT%H:%i:%sZ') AS closes_at,
      closed_at,created_at FROM community_polls ORDER BY created_at DESC LIMIT 100`);
    const [counts] = await db.query('SELECT poll_id,option_index,COUNT(*) AS total FROM community_votes GROUP BY poll_id,option_index');
    res.json({data:rows.map(r=>({...r,options_json:undefined,options:(typeof r.options_json==='string'?JSON.parse(r.options_json):r.options_json).map((label,index)=>({label,total:Number(counts.find(c=>c.poll_id===r.id&&c.option_index===index)?.total||0)}))}))});
  }));
  router.post('/admin/polls', wrap(async (req,res) => {
    const p = normalizePoll(req.body), id=randomUUID();
    await db.query('INSERT INTO community_polls (id,question,options_json,closes_at,created_by) VALUES (?,?,?,?,?)',[id,p.question,JSON.stringify(p.options),p.closes_at,req.user.id]);
    await audit({req,action:'community.poll_created',entityType:'community_poll',entityId:id});
    res.status(201).json({data:{id}});
  }));
  router.post('/admin/polls/:id/close', wrap(async (req,res) => {
    const [r] = await db.query('UPDATE community_polls SET closed_at=COALESCE(closed_at,UTC_TIMESTAMP()) WHERE id=?',[req.params.id]);
    if (!r.affectedRows) throw fail(404,'Encuesta no encontrada.');
    await audit({req,action:'community.poll_closed',entityType:'community_poll',entityId:req.params.id});
    res.json({success:true});
  }));
  router.get('/admin/reports', wrap(async (req,res) => {
    const status = STATUSES.includes(req.query.status)?req.query.status:null;
    const page = Math.max(1,Math.min(10000,parseInt(req.query.page)||1));
    const where = status?' WHERE status=?':'';
    const params = status?[status]:[];
    const [rows] = await db.query(`SELECT id,folio,category,subject,status,created_at FROM community_reports${where} ORDER BY created_at DESC,id LIMIT 20 OFFSET ?`,[...params,(page-1)*20]);
    const [[{total}]] = await db.query(`SELECT COUNT(*) AS total FROM community_reports${where}`,params);
    res.json({data:rows,total:Number(total),page});
  }));
  router.get('/admin/reports/:id', wrap(async (req,res) => {
    const [[row]] = await db.query('SELECT id,folio,category,subject,body,status,public_reply,revision,created_at,updated_at FROM community_reports WHERE id=?',[req.params.id]);
    if (!row) throw fail(404,'Reporte no encontrado.');
    const [history] = await db.query('SELECT status,internal_note,public_reply,created_at,actor_user_id FROM community_report_updates WHERE report_id=? ORDER BY id DESC',[row.id]);
    await audit({req,action:'community.report_read',entityType:'community_report',entityId:row.id});
    res.json({data:{...row,history}});
  }));
  router.patch('/admin/reports/:id', wrap(async (req,res) => {
    if (!STATUSES.includes(req.body?.status)) throw fail(400,'Estado inválido.');
    const note = text(req.body.internal_note||'','Nota interna',3000);
    const reply = text(req.body.public_reply||'','Respuesta al denunciante',3000);
    await transaction(async conn => {
      const [r] = await conn.query('UPDATE community_reports SET status=?,public_reply=?,revision=revision+1 WHERE id=? AND revision=?',[req.body.status,reply||null,req.params.id,Number(req.body.revision)||0]);
      if (!r.affectedRows) throw fail(409,'El reporte cambió. Recárgalo antes de guardar.');
      await conn.query('INSERT INTO community_report_updates (report_id,actor_user_id,status,internal_note,public_reply) VALUES (?,?,?,?,?)',[req.params.id,req.user.id,req.body.status,note||null,reply||null]);
    });
    await audit({req,action:'community.report_updated',entityType:'community_report',entityId:req.params.id});
    res.json({success:true});
  }));
  return router;
}
