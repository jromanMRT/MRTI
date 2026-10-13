import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { createCommunityRouter } from '../src/community/routes.js';
import { createChallengeService } from '../src/community/domain.js';

test('comunidad: HTTP/MySQL aislado, sin cuentas ni tablas de negocio', {skip:process.env.COMMUNITY_DB_TEST!=='1'},async t=>{
 const cfg=dotenv.parse(await readFile(new URL('../.env',import.meta.url)));
 const pool=mysql.createPool({host:cfg.MYSQL_HOST,port:Number(cfg.MYSQL_PORT||3306),user:cfg.MYSQL_USER,password:cfg.MYSQL_PASSWORD,database:cfg.MYSQL_DATABASE,connectionLimit:6});
 const names=['community_settings','community_polls','community_votes','community_reports','community_report_updates','community_rate_buckets','community_used_challenges'];
 const prefix='qa_com_'+randomUUID().replaceAll('-','').slice(0,8);
 const rewrite=sql=>sql.replace(/\bcommunity_\w+\b/g,key=>names.includes(key)?prefix+'_'+key.slice(10):key);
 let failInsert=false;
 const query=target=>async(sql,params)=>{if(failInsert&&sql.startsWith('INSERT INTO community_reports'))throw Object.assign(new Error('SQL includes sensitive report text'),{code:'QA_FAILURE'});return target.query(rewrite(sql),params);};
 const db={query:query(pool),async getConnection(){const c=await pool.getConnection();return{query:query(c),beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release()};}};
 const auth=(q,r,n)=>{const token=q.get('authorization')?.slice(7);if(!['admin','rh','reader','denied','viewer','viewer2'].includes(token))return r.status(401).json({error:'Sesión inválida'});q.user={id:token,role:token==='admin'?'administrator':'viewer',allowed_modules:['rh','reader','denied'].includes(token)?['rh']:[],access_policy:token==='reader'?{rh:{sections:{news:'read'}}}:token==='denied'?{rh:{sections:{news:'none'}}}:{}};n();};
 const audit=[];const secret='qa-community-secret-not-production';const challenge=()=>{const c=createChallengeService(secret,()=>Date.now()-4000).issue(),v=c.question.match(/\d+/g).map(Number);return{challenge_token:c.token,answer:String(v[0]+v[1]),website:''};};
 const report=()=>({category:'denuncia',subject:'Reporte temporal QA',body:'Contenido de prueba privado sin datos reales.',...challenge()});
 let server;
 try {
  const ddl=await readFile(new URL('../../mysql/migrations/024_community_home.sql',import.meta.url),'utf8');
  const migrate=async()=>{for(const sql of ddl.replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await db.query(sql);};
  await migrate();await migrate();
  const app=express();app.use(express.json());app.use('/api/portal/v1/community',createCommunityRouter({db,authRequired:auth,secret,audit:async a=>audit.push(a),fetchCalendar:async()=>({range:{from:'2026-10-09',to:'2026-11-08'},birthdays:[{name:'Persona QA',date:'2026-10-09',company:'Minera Río Tinto'}],events:[{title:'Encuentro de la comunidad',description:'Evento de prueba',starts_at:'2026-10-15T10:00:00',ends_at:null,all_day:false,location_label:'Sala de reuniones'}]})}));
  if(process.env.COMMUNITY_BROWSER_TEST==='1'){const build=path.resolve(process.env.COMMUNITY_BUILD_DIR);app.use(express.static(build));app.get('*',(_q,r)=>r.sendFile(path.join(build,'index.html')));}
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/portal/v1/community`;
  const call=(path,token=null,method='GET',body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let pollId,receipt,reportId;
  await t.test('lecturas públicas y autenticación/privacidad',async()=>{
    assert.equal((await call('/calendar')).status,200);assert.equal((await call('/channel')).status,200);
    for(const path of ['/polls','/admin/reports','/admin/settings','/admin/polls'])for(const token of [null,'invalid'])assert.equal((await call(path,token)).status,401);
    for(const token of ['viewer','denied'])assert.equal((await call('/admin/reports',token)).status,403);
    for(const token of ['rh','reader','admin'])assert.equal((await call('/admin/reports',token)).status,200);
    assert.equal((await call('/admin/polls','reader','POST',{})).status,403);
  });
  await t.test('crear encuesta, límite de una participación concurrente y alcance',async()=>{
    const r=await call('/admin/polls','rh','POST',{question:'Pregunta para QA',options:['Primera','Segunda'],closes_at:new Date(Date.now()+86400000).toISOString()});assert.equal(r.status,201);pollId=(await r.json()).data.id;
    assert.equal((await call(`/polls/${pollId}/vote`,null,'POST',{option_index:0})).status,401);
    assert.equal((await call(`/polls/${pollId}/vote`,'viewer','POST',{option_index:7})).status,400);
    const attempts=await Promise.all([0,1].map(option_index=>call(`/polls/${pollId}/vote`,'viewer','POST',{option_index})));
    assert.deepEqual(attempts.map(r=>r.status).sort(),[201,409]);
    const list=await(await call('/polls','viewer')).json();assert.notEqual(list.data[0].my_vote,null);
    assert.equal((await(await call('/polls','viewer2')).json()).data[0].my_vote,null);
    const results=await(await call('/admin/polls','admin')).json();assert.equal(results.data[0].options.reduce((s,x)=>s+x.total,0),1);assert.doesNotMatch(JSON.stringify(results),/viewer/);
  });
  await t.test('cierre y vencimiento bloquean votos',async()=>{
    assert.equal((await call(`/admin/polls/${pollId}/close`,'rh','POST')).status,200);
    assert.equal((await call(`/polls/${pollId}/vote`,'viewer2','POST',{option_index:0})).status,409);
    await db.query('UPDATE community_polls SET closed_at=NULL,closes_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[pollId]);
    assert.equal((await call(`/polls/${pollId}/vote`,'viewer2','POST',{option_index:0})).status,409);
  });
  await t.test('denuncia sin identidad, respuesta secreta y replay concurrente',async()=>{
    const payload=report();const replies=await Promise.all([call('/reports','admin','POST',payload),call('/reports',null,'POST',payload)]);
    assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);receipt=(await replies.find(r=>r.status===201).json()).data;
    const [[stored]]=await db.query('SELECT * FROM community_reports WHERE folio=?',[receipt.folio]);reportId=stored.id;
    assert.notEqual(stored.access_digest,receipt.access_code);assert.doesNotMatch(JSON.stringify(stored),/ip_address|user_id|request_id|authorization|user_agent/);
    assert.equal(audit.filter(a=>a.action.includes('report')).length,0);
    assert.equal((await call('/report-status',null,'POST',{folio:receipt.folio,access_code:'incorrecta'})).status,404);
    const status=await(await call('/report-status',null,'POST',receipt)).json();assert.equal(status.data.status,'received');assert.equal(status.data.body,undefined);
    assert.equal((await call('/reports',null,'POST',{...report(),website:'spam'})).status,400);
    assert.equal((await call('/reports',null,'POST',{...report(),answer:'0'})).status,400);
  });
  await t.test('seguimiento privado, respuesta pública y concurrencia',async()=>{
    assert.equal((await call(`/admin/reports/${reportId}`,'viewer')).status,403);
    const update={status:'reviewing',public_reply:'Estamos revisando tu mensaje.',internal_note:'Nota privada QA',revision:1};
    const results=await Promise.all([0,1].map(()=>call(`/admin/reports/${reportId}`,'rh','PATCH',update)));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const status=await(await call('/report-status',null,'POST',receipt)).json();assert.equal(status.data.public_reply,update.public_reply);assert.doesNotMatch(JSON.stringify(status),/privada|rh|actor_user/);
    const detail=await(await call(`/admin/reports/${reportId}`,'rh')).json();assert.equal(detail.data.history.length,1);assert.equal(detail.data.history[0].internal_note,update.internal_note);assert.equal(detail.data.access_digest,undefined);
  });
  await t.test('migración repetida conserva votos y reportes',async()=>{
    await migrate();assert.equal((await db.query('SELECT COUNT(*) AS n FROM community_reports'))[0][0].n,1);assert.equal((await db.query('SELECT COUNT(*) AS n FROM community_votes'))[0][0].n,1);
  });
  await t.test('rollback transaccional sin reportes/contadores/challenges parciales',async()=>{
    const before=(await db.query('SELECT SUM(hits) AS n FROM community_rate_buckets'))[0][0].n;failInsert=true;
    const r=await call('/reports',null,'POST',report());assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SQL|sensitive/);failInsert=false;
    assert.equal((await db.query('SELECT SUM(hits) AS n FROM community_rate_buckets'))[0][0].n,before);
  });
  await t.test('cuotas persistentes, cambios concurrentes y pausa',async()=>{
    const s={reports_enabled:true,hourly_limit:1,daily_limit:1,global_daily_limit:1,revision:1};
    assert.equal((await call('/admin/settings','rh','PUT',s)).status,200);assert.equal((await call('/admin/settings','rh','PUT',s)).status,409);
    const r=await call('/reports',null,'POST',report());assert.equal(r.status,429);assert.ok(r.headers.get('retry-after'));
    assert.equal((await call('/admin/settings','admin','PUT',{...s,reports_enabled:false,revision:2})).status,200);
    assert.equal((await call('/reports',null,'POST',report())).status,503);assert.equal((await(await call('/channel')).json()).data.enabled,false);
    assert.equal((await call('/report-status',null,'POST',receipt)).status,200);
  });

  if(process.env.COMMUNITY_BROWSER_TEST==='1')await t.test('navegador: escritorio/móvil, temas, envío anónimo, atención, encuesta y persistencia',async()=>{
    await db.query('UPDATE community_settings SET reports_enabled=1,hourly_limit=5,daily_limit=20,global_daily_limit=200');
    await db.query('DELETE FROM community_rate_buckets');
    const {checkCommunityBrowser}=await import('./helpers/communityBrowser.js');
    await checkCommunityBrowser(base.replace('/api/portal/v1/community',''),process.env.COMMUNITY_BROWSER_OUTPUT);
  });
 }finally{if(server)await new Promise(r=>server.close(r));for(const name of [...names].reverse())await db.query(`DROP TABLE IF EXISTS ${name}`);await pool.end();}
});
