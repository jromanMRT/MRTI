import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { pool } from '../src/db.js';
import { signToken, authRequired } from '../src/auth/shared.js';
import { accessPolicyRouter } from '../src/auth/accessPolicyRoutes.js';
import { accessControlRouter } from '../src/auth/accessControlRoutes.js';
import { createCoreAuth } from '../src/vendor/mrti-platform/core-auth.js';
test('contrato HTTP/MySQL de permisos y consumidores (opt-in)', { skip: process.env.ACCESS_POLICY_INTEGRATION !== '1' }, async (t) => {
 const admin=randomUUID(), viewer=randomUUID(); let server,consumerServer;
 try {
  for(const [id,role] of [[admin,'administrator'],[viewer,'viewer']]) await pool.query('INSERT INTO user_profiles (id,email,password_hash,full_name,role,is_active) VALUES (?,?,?,?,?,1)',[id,`acl-${id}@contract.test`,'disabled-test-login','Permisos fixture',role]);
  const app=express();app.use(express.json());app.use('/api/auth',accessPolicyRouter,accessControlRouter);app.get('/identity',authRequired,(q,r)=>r.json({profile:q.user}));app.use((e,q,r,n)=>r.status(500).json({error:e.message}));
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;const a=signToken(admin),v=signToken(viewer);
  const call=(path,token=a,options={})=>fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
  const url=`/api/auth/permissions/admin/user/${viewer}`;
  const samples=[['rh','people','/api/rh/employees','/api/rh/payroll-cost'],['activos','inventory','/api/activos/12','/api/technical-notes'],['mrti-obs','ups','/api/ups','/api/monitoring'],['tickets','knowledge','/api/kb-articles','/api/tickets'],['mrti-legal','records','/api/legal/cases','/api/legal/roles'],['compras','inventario','/api/compras/inventory/items','/api/compras/payments/summary'],['mantenimiento','equipment','/api/mantenimiento/equipment','/api/mantenimiento/orders'],['agent-core','agents','/api/v1/agents','/api/v1/agents/12/commands']];
  const payload={revision:0,reason:'Contrato de permisos por sección',policy:Object.fromEntries(samples.map(([code,section])=>[code,{access:true,level:'none',sections:{[section]:'read'}}]))};
  const save=(body,token=a,target=url)=>call(target,token,{method:'PUT',body:JSON.stringify(body)});
  await t.test('401 sin sesión/inválida; 403 para usuario normal',async()=>{for(const token of [null,'invalid'])assert.equal((await call('/api/auth/permissions/admin',token)).status,401);assert.equal((await call('/api/auth/permissions/admin',v)).status,403);assert.equal((await save(payload,v)).status,403);});
  await t.test('excepción persistente, UUID y rol intactos; auditoría transaccional',async()=>{assert.equal((await save(payload)).status,200);const {profile}=await(await call('/identity',v)).json();assert.equal(profile.id,viewer);assert.equal(profile.role,'viewer');assert.equal(profile.allowed_modules.length,8);assert.equal((await pool.query('SELECT COUNT(*) AS n FROM access_policy_events WHERE subject_id=?',[viewer]))[0][0].n,1);});
  await t.test('concurrencia e idempotencia',async()=>{assert.equal((await save(payload)).status,409);assert.equal((await(await save({...payload,revision:1})).json()).unchanged,true);assert.equal((await pool.query('SELECT COUNT(*) AS n FROM access_policy_events WHERE subject_id=?',[viewer]))[0][0].n,1);});
  await t.test('administrador protegido y validación de secciones',async()=>{assert.equal((await save(payload,a,`/api/auth/permissions/admin/user/${admin}`)).status,409);assert.equal((await save({...payload,policy:{rh:{sections:{inventado:'read'}}}})).status,400);});
  for(const [code,section,allowed,denied] of samples) await t.test(`${code}: consulta permitida, escritura/otra sección denegadas`,async()=>{for(const [method,path,expected] of [['GET',allowed,204],['POST',allowed,403],['GET',denied,403],['DELETE',allowed,403]])assert.equal((await call(`/api/auth/module-access/${code}?${new URLSearchParams({method,path})}`,v)).status,expected,`${method} ${path}`);});
  await t.test('consumidor valida ruta original y método',async()=>{const consumer=express();const auth=createCoreAuth({service:'acl-test',moduleCode:'rh',coreUrl:base});consumer.use('/api/rh',auth.moduleAccessRequired,(q,r)=>r.json({ok:true}));consumerServer=consumer.listen(0,'127.0.0.1');await new Promise(r=>consumerServer.once('listening',r));const cb=`http://127.0.0.1:${consumerServer.address().port}`;for(const [method,path,expected] of [['GET','employees',200],['POST','employees',403],['GET','payroll-cost',403]])assert.equal((await fetch(`${cb}/api/rh/${path}`,{method,headers:{Authorization:`Bearer ${v}`}})).status,expected);});
  await t.test('DDL idempotente conserva políticas',async()=>{const sql=await readFile(new URL('../../mysql/migrations/023_granular_access.sql',import.meta.url),'utf8');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await pool.query(statement);assert.equal((await pool.query('SELECT revision FROM access_policies WHERE subject_id=?',[viewer]))[0][0].revision,1);});
  await t.test('revocación efectiva con el mismo token',async()=>{assert.equal((await save({...payload,revision:1,policy:{rh:{access:false}}})).status,200);assert.equal((await call('/api/auth/module-access/rh',v)).status,403);});
 } finally {
  await pool.query('DELETE FROM access_policy_events WHERE subject_id IN (?,?) OR actor_id=?',[admin,viewer,admin]);await pool.query('DELETE FROM access_policies WHERE subject_type=? AND subject_id IN (?,?)',['user',admin,viewer]);await pool.query('DELETE FROM user_profiles WHERE id IN (?,?)',[admin,viewer]);
  assert.equal((await pool.query('SELECT COUNT(*) AS n FROM user_profiles WHERE id IN (?,?)',[admin,viewer]))[0][0].n,0);
  await Promise.all([server,consumerServer].filter(Boolean).map(s=>new Promise(r=>s.close(r))));await pool.end();
 }
});
