import { Router } from 'express';
import { pool } from '../db.js';
import { recordAudit } from '../audit.js';
import { authRequired, findProfile } from './shared.js';

export const personalizationRouter = Router();

const DEFAULTS = Object.freeze({
  theme: 'system',
  density: 'comfortable',
  show_notifications: true,
  show_rh: true,
  show_assets: true,
  show_tickets: true,
});

function serializePreferences(row) {
  if (!row) return { ...DEFAULTS };
  return {
    theme: row.theme,
    density: row.density,
    show_notifications: Boolean(row.show_notifications),
    show_rh: Boolean(row.show_rh),
    show_assets: Boolean(row.show_assets),
    show_tickets: Boolean(row.show_tickets),
  };
}

function parseAvatarDataUrl(value) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || value.length > 60000) return null;
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 44000) return null;
  const valid = match[1] === 'png'
    ? data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : match[1] === 'jpeg'
      ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      : data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
  return valid ? { mimeType: `image/${match[1]}`, data } : null;
}

function validAvatarDataUrl(value) { return Boolean(parseAvatarDataUrl(value)); }

personalizationRouter.get('/profile/preferences', authRequired, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM user_workspace_preferences WHERE user_id = ? LIMIT 1', [req.user.id]);
    res.json({ preferences: serializePreferences(rows[0]) });
  } catch (error) {
    next(error);
  }
});

personalizationRouter.patch('/profile/preferences', authRequired, async (req, res, next) => {
  try {
    const theme = String(req.body?.theme || 'system');
    const density = String(req.body?.density || 'comfortable');
    if (!['system', 'light', 'dark'].includes(theme) || !['comfortable', 'compact'].includes(density)) {
      return res.status(400).json({ error: 'Preferencias de apariencia no válidas' });
    }
    const values = [
      req.user.id, theme, density,
      req.body?.show_notifications !== false,
      req.body?.show_rh !== false,
      req.body?.show_assets !== false,
      req.body?.show_tickets !== false,
    ];
    await pool.query(
      `INSERT INTO user_workspace_preferences
        (user_id, theme, density, show_notifications, show_rh, show_assets, show_tickets)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE theme = VALUES(theme), density = VALUES(density),
         show_notifications = VALUES(show_notifications), show_rh = VALUES(show_rh),
         show_assets = VALUES(show_assets), show_tickets = VALUES(show_tickets)`,
      values
    );
    await recordAudit({ req, action: 'profile.preferences_updated', entityType: 'user', entityId: req.user.id });
    res.json({ preferences: serializePreferences({ theme, density, show_notifications: values[3], show_rh: values[4], show_assets: values[5], show_tickets: values[6] }) });
  } catch (error) {
    next(error);
  }
});

personalizationRouter.patch('/profile/avatar', authRequired, async (req, res, next) => {
  try {
    const avatarDataUrl = req.body?.avatar_data_url == null ? null : String(req.body.avatar_data_url);
    const avatar = avatarDataUrl ? parseAvatarDataUrl(avatarDataUrl) : null;
    if (avatarDataUrl && !avatar) {
      return res.status(400).json({ error: 'Usa una foto PNG, JPG o WebP válida de máximo 44 KB' });
    }
    if (avatar) {
      await pool.query(
        `INSERT INTO user_profile_avatars (user_id, mime_type, content) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), content = VALUES(content)`,
        [req.user.id, avatar.mimeType, avatar.data]
      );
    } else {
      await pool.query('DELETE FROM user_profile_avatars WHERE user_id = ?', [req.user.id]);
    }
    const avatarUrl = avatar ? '/api/auth/profile/avatar/content' : null;
    await pool.query('UPDATE user_profiles SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);
    await recordAudit({ req, action: avatarDataUrl ? 'profile.avatar_updated' : 'profile.avatar_removed', entityType: 'user', entityId: req.user.id });
    res.json({ profile: await findProfile(req.user.id, req.headers.authorization) });
  } catch (error) {
    next(error);
  }
});

personalizationRouter.get('/profile/avatar/content', authRequired, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT mime_type, content, updated_at FROM user_profile_avatars WHERE user_id = ? LIMIT 1', [req.user.id]);
    const avatar = rows[0];
    if (!avatar) return res.status(404).json({ error: 'Foto de perfil no encontrada' });
    res.setHeader('Content-Type', avatar.mime_type);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Last-Modified', new Date(avatar.updated_at).toUTCString());
    res.send(avatar.content);
  } catch (error) {
    next(error);
  }
});

export { DEFAULTS as DEFAULT_WORKSPACE_PREFERENCES, serializePreferences, validAvatarDataUrl };
