import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNavigationDestinations,
  normalizeNavigationText,
  searchNavigationDestinations,
} from './navigation-search.js';

const applications = [
  {
    code: 'rh',
    name: 'MRTI Recursos Humanos',
    url: '/rh/',
    category: 'Personas',
    description: 'Vacaciones y estructura organizacional',
    features: ['Directorio'],
  },
  {
    code: 'activos',
    name: 'MRTI Activos',
    url: '/activos/',
    category: 'Tecnología',
  },
];

test('normaliza acentos y mayúsculas para consultas de navegación', () => {
  assert.equal(normalizeNavigationText('ÁREAS y MÓDULOS'), 'areas y modulos');
});

test('sólo incluye módulos permitidos y destinos del Centro de control para administradores', () => {
  const profile = { role: 'user', allowed_modules: ['rh'] };
  const destinations = buildNavigationDestinations(profile, applications);
  assert.ok(destinations.some(({ title }) => title === 'MRTI Recursos Humanos'));
  assert.ok(!destinations.some(({ title }) => title === 'MRTI Activos'));
  assert.ok(!destinations.some(({ title }) => title === 'Centro de control'));

  const administratorDestinations = buildNavigationDestinations({ role: 'administrator' }, applications);
  assert.ok(administratorDestinations.some(({ title }) => title === 'MRTI Activos'));
  assert.ok(administratorDestinations.some(({ title }) => title === 'Centro de control'));
});

test('encuentra destinos y módulos por título, palabras clave y consultas con varios términos', () => {
  const destinations = buildNavigationDestinations({ role: 'user', allowed_modules: ['rh'] }, applications);
  assert.equal(searchNavigationDestinations(destinations, 'vacaciones')[0].title, 'MRTI Recursos Humanos');
  assert.equal(searchNavigationDestinations(destinations, 'mis tickets')[0].id, 'my-tickets');
  assert.equal(searchNavigationDestinations(destinations, 'empleado folio activo').length, 0);
});

test('rechaza URL de módulos externas o malformadas', () => {
  const destinations = buildNavigationDestinations(
    { role: 'administrator' },
    [{ code: 'external', name: 'No válido', url: '//example.com' }],
  );
  assert.ok(!destinations.some(({ id }) => id === 'module-external'));
});
