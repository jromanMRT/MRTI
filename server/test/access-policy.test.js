import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy, combinePolicies, applyPolicy } from '../src/auth/accessPolicy.js';
const p = { id:'u', role:'viewer', allowed_modules:['rh'], is_active:true };
test('sin políticas conserva los accesos vigentes', () => {
  assert.deepEqual(applyPolicy(p,{}, {}, ['rh','activos']).allowed_modules,['rh']);
});
test('usuario prevalece sobre rol; heredar mantiene secciones del rol', () => {
  const role = { rh:{ access:false, level:'none', sections:{people:'read'} } };
  const user = { rh:{ access:true, sections:{people:'write'} } };
  const effective = applyPolicy(p,role,user,['rh']);
  assert.deepEqual(effective.allowed_modules,['rh']);
  assert.equal(effective.access_policy.rh.sections.people,'write');
  assert.equal(effective.access_policy.rh.level,'none');
});
test('concede módulo individual activo, nunca aplicaciones inactivas', () => {
  const effective = applyPolicy(p,{}, {activos:{access:true,level:'read'},tickets:{access:true}}, ['rh','activos']);
  assert.deepEqual(effective.allowed_modules,['rh','activos']);
});
test('nivel ninguno sin secciones utilizables retira módulo del catálogo', () => {
  assert.deepEqual(applyPolicy(p,{rh:{level:'none'}},{},['rh']).allowed_modules,[]);
});
test('rechaza campos, módulos, secciones y niveles no declarados', () => {
  for (const v of [null,[],{unknown:{}},{rh:{all:true}},{rh:{access:'true'}},{rh:{level:'admin'}},{rh:{sections:{unknown:'read'}}},{rh:{sections:[]}}]) assert.throws(()=>validatePolicy(v));
});
test('normaliza herencia vacía sin cambiar entrada', () => {
  assert.deepEqual(validatePolicy({rh:{sections:{}}}),{});
  assert.deepEqual(combinePolicies({rh:{level:'read'}},{}),{rh:{level:'read',sections:{}}});
});
