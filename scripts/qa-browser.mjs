import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.env.MRTI_QA_WRITE_FIXTURES !== '1') throw new Error('Esta prueba crea y elimina dos cuentas temporales. Ejecutar con MRTI_QA_WRITE_FIXTURES=1.');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.MRTI_QA_OUTPUT || '/tmp/mrti-platform-qa';
await mkdir(output, { recursive: true });
const require = createRequire(new URL('../server/package.json', import.meta.url));
require('dotenv').config({path:path.join(root, 'server/.env'),quiet:true});
const {pool}=await import('../server/src/db.js');
const bcrypt=require('bcryptjs');
const {chromium}=await import(process.env.MRTI_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.MRTI_QA_BASE_URL || 'http://127.0.0.1';
const users=['administrator','viewer'].map(role=>({role,id:randomUUID(),email:`qa-${randomUUID()}@contract.test`}));
const report={api:[],pages:[]};let browser;
let failures=0;
const paths=['/','/mrti-obs/','/mrti-obs/sites','/mrti-obs/monitoring','/mrti-obs/floor-plans','/mrti-obs/alerts','/mrti-obs/discovery','/mrti-obs/racks','/mrti-obs/history','/mrti-obs/settings','/mrti-obs/ups','/mrti-obs/servers','/activos/','/activos/inventario','/activos/inventario/unidades','/activos/alertas','/activos/bajas-personal','/activos/nuevo','/rh/','/rh/empleados','/rh/empleados/nuevo','/rh/organigrama','/rh/estructura-organizacional','/rh/puestos','/rh/unidades','/rh/vacaciones','/rh/salas','/rh/calendario','/rh/control-contpaq','/rh/historial','/tickets/','/tickets/tickets','/tickets/tickets/new','/tickets/knowledge-base','/tickets/settings/sla-policies','/mrti-legal/','/mrti-legal/expedientes','/mrti-legal/expedientes/nuevo','/mrti-legal/auditoria'];
const extraPaths=['/?view=account','/?view=control-center','/mrti-obs/news-screen',...['credenciales','componentes','impresoras','nvr','passwords','starlink','fortigate','dominios','mantenimientos','unidades','documentos','config-alertas'].map(key=>'/activos/catalogos/'+key),'http://127.0.0.1:8477/','http://127.0.0.1:8477/downloads/'];
paths.push(...extraPaths);
const selectedPaths=process.env.MRTI_QA_EXTRA_ONLY==='1'?extraPaths:paths;
try {
 const password=randomUUID();const hash=await bcrypt.hash(password,10);
 for(const u of users){
  await pool.query('INSERT INTO user_profiles (id,email,password_hash,full_name,role,is_active) VALUES (?,?,?,?,?,1)',[u.id,u.email,hash,'QA temporal plataforma',u.role]);
  const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password})});
  if(r.status!==200)throw Error('Login fixture '+r.status);u.session=await r.json();
 }
 const endpoints=['/api/db/devices','/activos-api/api/activos','/rh-api/api/rh/employees','/tickets-api/api/tickets','/legal-api/api/legal/cases'];
 for(const endpoint of endpoints)for(const mode of ['none','invalid',...users]){
  const token=mode==='none'?null:mode==='invalid'?'invalid':mode.session.token;
  const r=await fetch(base+endpoint,{headers:token?{Authorization:`Bearer ${token}`}:{}});await r.arrayBuffer();
  const role=typeof mode==='string'?mode:mode.role; const expected=role==='administrator'?200:role==='viewer'?403:401;
  if(r.status!==expected) failures++;
  report.api.push({endpoint,role,status:r.status,expected});console.log('API',role,endpoint,r.status);
 }
 browser=await chromium.launch({headless:true, executablePath:process.env.MRTI_CHROMIUM_PATH || undefined});
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.addInitScript(({token,profile})=>{localStorage.setItem('auth_token',token);sessionStorage.setItem('mrti_portal_token',token);localStorage.setItem('auth_profile',JSON.stringify(profile));},users[0].session);
  for(const path of selectedPaths){
   const page=await context.newPage();const errors=[];const http=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)http.push({path:new URL(r.url()).pathname,status:r.status()});});
   try{
    await page.goto(path.startsWith('http')?path:base+path,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForTimeout(1000);
    const info=await page.evaluate(()=>({title:document.title,heading:[...document.querySelectorAll('h1')].map(x=>x.textContent).join(' | '),textLength:document.body.innerText.length,overflow:document.documentElement.scrollWidth>innerWidth+2}));
    const unexpected=http.filter(r=>!(path==='/' && r.path==='/rh-api/api/rh-self/me' && r.status===404));
    if(errors.length || unexpected.length || info.overflow || info.textLength<40) failures++;
    report.pages.push({path,width:viewport.width,...info,errors,http});console.log('PAGE',viewport.width,path,JSON.stringify({errors,http,overflow:info.overflow}));
   }catch(e){failures++;report.pages.push({path,width:viewport.width,error:e.message});console.log('PAGE FAILED',path,e.message)}finally{await page.close();}
  }
  await context.close();
 }
}finally{
 await browser?.close();
 for(const u of users){await pool.query('DELETE FROM audit_events WHERE actor_user_id=? OR actor_email=?',[u.id,u.email]);await pool.query('DELETE FROM user_profiles WHERE id=?',[u.id]);}
 const [rows]=await pool.query('SELECT COUNT(*) AS count FROM user_profiles WHERE id IN (?,?)',users.map(u=>u.id));report.residualFixtures=rows[0].count;
 await pool.end();report.failures=failures;
 await writeFile(path.join(output,'browser-results.json'),JSON.stringify(report,null,2));
 if(failures || report.residualFixtures)process.exitCode=1;
}
