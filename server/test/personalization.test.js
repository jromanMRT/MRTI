import assert from 'node:assert/strict';
import test from 'node:test';
import { serializePreferences, validAvatarDataUrl, validWorkspaceTheme } from '../src/auth/personalizationRoutes.js';

test('preferencias personales tienen defaults y booleanos normalizados', () => {
  assert.equal(serializePreferences(null).theme, 'system');
  assert.deepEqual(serializePreferences({ theme: 'dark', density: 'compact', show_notifications: 1, show_rh: 0, show_assets: 1, show_tickets: 0 }), {
    theme: 'dark', density: 'compact', show_notifications: true, show_rh: false, show_assets: true, show_tickets: false,
  });
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
