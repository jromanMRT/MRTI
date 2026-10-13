import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallengeService, normalizeReport, normalizePoll, normalizeSettings } from '../src/community/domain.js';
test('denuncias: valida categoría y longitudes; descarta identidad enviada',()=>{
 const r=normalizeReport({category:'denuncia',subject:'Asunto válido',body:'Descripción suficiente de hechos',user_id:'otro',ip:'1.2.3.4'});
 assert.deepEqual(Object.keys(r),['category','subject','body']);
 for(const body of [{...r,category:'otro'},{...r,subject:'x'},{...r,body:'x'},{...r,body:'x'.repeat(5001)}])assert.throws(()=>normalizeReport(body),{status:400});
});
test('encuestas: opciones únicas, fecha futura y límites',()=>{
 const now=Date.now(),body={question:'Pregunta válida',options:['Uno','Dos'],closes_at:new Date(now+100000).toISOString()};
 assert.equal(normalizePoll(body,now).options.length,2);
 for(const changes of [{options:['Uno','uno']},{options:['Uno']},{closes_at:new Date(now-1).toISOString()},{options:['x'.repeat(121),'Dos']},{closes_at:'abc'}])assert.throws(()=>normalizePoll({...body,...changes},now),{status:400});
});
test('límites del canal: mínimos y jerarquía obligatorios',()=>{
 const body={reports_enabled:true,hourly_limit:5,daily_limit:20,global_daily_limit:200};
 assert.deepEqual(normalizeSettings(body),body);
 for(const changes of [{reports_enabled:1},{hourly_limit:0},{daily_limit:4},{global_daily_limit:19},{hourly_limit:1.5}])assert.throws(()=>normalizeSettings({...body,...changes}),{status:400});
});
test('verificación firmada: tiempo, respuesta, honeypot, manipulación y vencimiento',()=>{
 let now=100000;const c=createChallengeService('test-secret',()=>now),issued=c.issue();
 const numbers=issued.question.match(/\d+/g).map(Number),answer=String(numbers[0]+numbers[1]);
 assert.throws(()=>c.verify(issued.token,answer),{status:400});now+=4000;
 assert.match(c.verify(issued.token,answer),/^[a-f0-9-]{36}$/);
 assert.throws(()=>c.verify(issued.token,'0'),{status:400});assert.throws(()=>c.verify(issued.token,answer,'spam'),{status:400});
 assert.throws(()=>c.verify(issued.token+'x',answer),{status:400});assert.throws(()=>c.verify('bad',answer),{status:400});
 now+=16*60000;assert.throws(()=>c.verify(issued.token,answer),{status:400});
});
test('HMAC de red cambia por día, no contiene IP ni datos reversibles',()=>{
 const c=createChallengeService('test-secret');const key=c.networkKey('192.168.0.1','2026-10-09');
 assert.equal(key.length,64);assert.notEqual(key,c.networkKey('192.168.0.1','2026-10-10'));assert.notEqual(key,c.networkKey('192.168.0.2','2026-10-09'));
});
