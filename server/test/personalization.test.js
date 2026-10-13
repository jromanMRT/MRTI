import assert from 'node:assert/strict';
import test from 'node:test';
import { serializePreferences, validAvatarDataUrl, validWidgetOrder, validWorkspaceTheme } from '../src/auth/personalizationRoutes.js';

test('preferencias personales tienen defaults y booleanos normalizados', () => {
  assert.equal(serializePreferences(null).theme, 'system');
  assert.deepEqual(serializePreferences(null).widget_order, ['rh', 'assets', 'tickets', 'requisitions']);
  assert.equal(serializePreferences(null).show_requisitions, true);
  assert.deepEqual(serializePreferences({ theme: 'dark', density: 'compact', show_notifications: 1, show_rh: 0, show_assets: 1, show_tickets: 0 }), {
    theme: 'dark', density: 'compact', show_notifications: true, show_rh: false, show_assets: true, show_tickets: false,
    show_requisitions: true, widget_order: ['rh', 'assets', 'tickets', 'requisitions'],
  });
});

test('el orden de widgets acepta sólo una permutación completa', () => {
  assert.equal(validWidgetOrder(['tickets', 'rh', 'requisitions', 'assets']), true);
  assert.equal(validWidgetOrder(['tickets', 'rh', 'assets', 'assets']), false);
  assert.equal(validWidgetOrder(['tickets', 'rh', 'assets']), false);
  assert.equal(validWidgetOrder(['tickets', 'rh', 'assets', 'other']), false);
  assert.deepEqual(serializePreferences({ widget_order: '["tickets","rh","assets","requisitions"]' }).widget_order, [
    'tickets', 'rh', 'assets', 'requisitions',
  ]);
  assert.deepEqual(serializePreferences({ widget_order: 'invalid' }).widget_order, [
    'rh', 'assets', 'tickets', 'requisitions',
  ]);
});

test('avatar sólo acepta imágenes pequeñas con firma real', () => {
  const png = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a00000000', 'hex').toString('base64')}`;
  assert.equal(validAvatarDataUrl(png), true);
  assert.equal(validAvatarDataUrl('data:image/png;base64,bm8tZXMtaW1hZ2Vu'), false);
  assert.equal(validAvatarDataUrl('https://example.com/avatar.png'), false);
});

test('tema compartido sólo acepta los modos del contrato visual', () => {
  assert.equal(validWorkspaceTheme('system'), true);
  assert.equal(validWorkspaceTheme('light'), true);
  assert.equal(validWorkspaceTheme('dark'), true);
  assert.equal(validWorkspaceTheme('blue'), false);
});
