import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import express, { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../auth/shared.js';
import { recordAudit } from '../audit.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGES = new Map([
  ['image/png', { extension: '.png', format: 'PNG' }],
  ['image/jpeg', { extension: ['.jpg', '.jpeg'], format: 'JPG' }],
  ['image/webp', { extension: '.webp', format: 'WEBP' }],
  ['image/svg+xml', { extension: '.svg', format: 'SVG' }],
]);
const APPEARANCE_SLOTS = new Map([
  ['portal_logo', 'Logo del portal'],
  ['login_background', 'Fondo del inicio de sesión'],
]);

export const brandAssetRouter = Router();

function administratorOnly(req, res, next) {
  if (req.user?.role !== 'administrator') {
    return res.status(403).json({ error: 'Sólo un administrador global puede gestionar recursos de marca' });
  }
  return next();
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function metadataValue(value, { label, required = false, max }) {
  const text = String(value || '').trim();
  if (required && text.length < 2) throw httpError(400, `${label} es obligatorio`);
  if (text.length > max) throw httpError(400, `${label} excede ${max} caracteres`);
  return text || null;
}

export function safeOriginalFilename(value) {
  const filename = path.basename(String(value || '').replace(/[\x00-\x1f\x7f]/g, '')).trim();
  if (!filename || filename.length > 255) throw httpError(400, 'Nombre de archivo no válido');
  return filename;
}

function hasExpectedExtension(filename, expected) {
  const extension = path.extname(filename).toLowerCase();
  return (Array.isArray(expected) ? expected : [expected]).includes(extension);
}

export function validateImageContent(mimeType, content, filename) {
  const definition = ALLOWED_IMAGES.get(mimeType);
  if (!definition) throw httpError(415, 'Formato no permitido. Usa SVG, PNG, JPG o WebP');
  if (!Buffer.isBuffer(content) || content.length === 0) throw httpError(400, 'Selecciona una imagen con contenido');
  if (content.length > MAX_FILE_SIZE) throw httpError(413, 'La imagen excede el límite de 10 MB');
  if (!hasExpectedExtension(filename, definition.extension)) throw httpError(400, 'La extensión no coincide con el formato de la imagen');

  let validSignature = false;
  if (mimeType === 'image/png') validSignature = content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/jpeg') validSignature = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  if (mimeType === 'image/webp') validSignature = content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimeType === 'image/svg+xml') {
    const svg = content.toString('utf8').trim();
    validSignature = /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)
      && !/<(?:script|foreignObject)\b|\bon\w+\s*=|javascript:|data:text\/html|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(svg);
  }
  if (!validSignature) throw httpError(400, 'El contenido no corresponde a una imagen válida o segura');
  return definition;
}

function serializeAsset(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    format: ALLOWED_IMAGES.get(row.mime_type)?.format || row.mime_type,
    file_size: Number(row.file_size),
    sort_order: Number(row.sort_order),
    created_at: row.created_at,
    content_url: `/api/portal/v1/brand-assets/${row.id}/content`,
  };
}

function sendAssetContent(res, asset, { disposition = 'inline', cacheControl = 'private, max-age=300' } = {}) {
  const asciiName = asset.original_filename.replace(/[^A-Za-z0-9._-]/g, '_');
  res.set({
    'Content-Type': asset.mime_type,
    'Content-Length': String(asset.file_size),
    'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(asset.original_filename)}`,
    'Cache-Control': cacheControl,
    ETag: `"${asset.checksum_sha256}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(asset.content);
}

brandAssetRouter.get('/brand-appearance', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT appearance.slot, appearance.asset_id, assets.name, assets.mime_type
         FROM brand_appearance appearance
         LEFT JOIN brand_assets assets
           ON assets.id = appearance.asset_id AND assets.archived_at IS NULL
        ORDER BY appearance.slot`
    );
    const data = Object.fromEntries([...APPEARANCE_SLOTS].map(([slot, label]) => {
      const row = rows.find((item) => item.slot === slot && item.name);
      return [slot, {
        label,
        asset_id: row?.asset_id || null,
        asset_name: row?.name || null,
        content_url: row ? `/api/portal/v1/brand-appearance/${slot}/content` : null,
      }];
    }));
    res.set('Cache-Control', 'no-store').json({ data });
  } catch (error) {
    next(error);
  }
});

brandAssetRouter.get('/brand-appearance/:slot/content', async (req, res, next) => {
  try {
    if (!APPEARANCE_SLOTS.has(req.params.slot)) return res.status(404).json({ error: 'Uso de marca no encontrado' });
    const [[asset]] = await pool.query(
      `SELECT assets.original_filename, assets.mime_type, assets.file_size, assets.checksum_sha256, assets.content
         FROM brand_appearance appearance
         JOIN brand_assets assets ON assets.id = appearance.asset_id AND assets.archived_at IS NULL
        WHERE appearance.slot = ?`,
      [req.params.slot]
    );
    if (!asset) return res.status(404).json({ error: 'No hay una imagen asignada' });
    sendAssetContent(res, asset, { cacheControl: 'public, no-cache' });
  } catch (error) {
    next(error);
  }
});

brandAssetRouter.get('/brand-assets', authRequired, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, original_filename, mime_type, file_size, sort_order, created_at
         FROM brand_assets WHERE archived_at IS NULL ORDER BY sort_order, name, created_at`
    );
    res.json({ data: rows.map(serializeAsset) });
  } catch (error) {
    next(error);
  }
});

brandAssetRouter.get('/brand-assets/:id/content', authRequired, async (req, res, next) => {
  try {
    const [[asset]] = await pool.query(
      `SELECT original_filename, mime_type, file_size, checksum_sha256, content
         FROM brand_assets WHERE id = ? AND archived_at IS NULL`,
      [req.params.id]
    );
    if (!asset) return res.status(404).json({ error: 'Recurso de marca no encontrado' });
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    sendAssetContent(res, asset, { disposition });
  } catch (error) {
    next(error);
  }
});

brandAssetRouter.post(
  '/admin/brand-assets',
  authRequired,
  administratorOnly,
  express.raw({ type: () => true, limit: MAX_FILE_SIZE }),
  async (req, res, next) => {
    try {
      const name = metadataValue(req.query.name, { label: 'Nombre', required: true, max: 120 });
      const description = metadataValue(req.query.description, { label: 'Descripción', max: 500 });
      const originalFilename = safeOriginalFilename(req.query.filename);
      const mimeType = String(req.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      validateImageContent(mimeType, req.body, originalFilename);
      const requestedOrder = Number(req.query.sort_order ?? 100);
      if (!Number.isInteger(requestedOrder) || requestedOrder < 0 || requestedOrder > 10000) {
        throw httpError(400, 'Orden no válido');
      }
      const id = randomUUID();
      const checksum = createHash('sha256').update(req.body).digest('hex');
      await pool.query(
        `INSERT INTO brand_assets
          (id, name, description, original_filename, mime_type, file_size,
           checksum_sha256, content, sort_order, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, description, originalFilename, mimeType, req.body.length, checksum, req.body, requestedOrder, req.user.id]
      );
      await recordAudit({
        req,
        action: 'brand_asset.created',
        entityType: 'brand_asset',
        entityId: id,
        metadata: { filename: originalFilename, mime_type: mimeType, file_size: req.body.length, checksum },
      });
      res.status(201).json({ id });
    } catch (error) {
      next(error);
    }
  }
);

brandAssetRouter.put('/admin/brand-appearance/:slot', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const { slot } = req.params;
    if (!APPEARANCE_SLOTS.has(slot)) return res.status(404).json({ error: 'Uso de marca no encontrado' });
    const assetId = req.body?.asset_id ? String(req.body.asset_id) : null;
    if (assetId) {
      const [[asset]] = await pool.query('SELECT id FROM brand_assets WHERE id = ? AND archived_at IS NULL', [assetId]);
      if (!asset) return res.status(400).json({ error: 'Selecciona un recurso de marca activo' });
    }
    await pool.query(
      `INSERT INTO brand_appearance (slot, asset_id, updated_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE asset_id = VALUES(asset_id), updated_by_user_id = VALUES(updated_by_user_id)`,
      [slot, assetId, req.user.id]
    );
    await recordAudit({
      req,
      action: 'brand_appearance.updated',
      entityType: 'brand_appearance',
      entityId: slot,
      metadata: { asset_id: assetId },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

brandAssetRouter.delete('/admin/brand-assets/:id', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const [[asset]] = await pool.query(
      'SELECT id, name, original_filename FROM brand_assets WHERE id = ? AND archived_at IS NULL',
      [req.params.id]
    );
    if (!asset) return res.status(404).json({ error: 'Recurso de marca no encontrado' });
    const [[usage]] = await pool.query('SELECT slot FROM brand_appearance WHERE asset_id = ? LIMIT 1', [asset.id]);
    if (usage) return res.status(409).json({ error: 'Este recurso está en uso. Asigna otra imagen o restaura el valor predeterminado antes de quitarlo' });
    await pool.query(
      'UPDATE brand_assets SET archived_at = CURRENT_TIMESTAMP, archived_by_user_id = ? WHERE id = ?',
      [req.user.id, asset.id]
    );
    await recordAudit({
      req,
      action: 'brand_asset.archived',
      entityType: 'brand_asset',
      entityId: asset.id,
      metadata: { name: asset.name, filename: asset.original_filename },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
