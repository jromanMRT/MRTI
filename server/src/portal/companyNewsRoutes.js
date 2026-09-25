import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import express, { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, findProfileIdentity } from '../auth/shared.js';
import { JWT_SECRET } from '../config/security.js';
import { recordAudit } from '../audit.js';
import { safeOriginalFilename, validateImageContent } from './brandAssetRoutes.js';

export const companyNewsRouter = Router();

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const MAX_TITLE_LENGTH = 160;
const MAX_BODY_LENGTH = 5000;
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function isZipContainer(content) {
  const signature = content.subarray(0, 4);
  return signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) || signature.equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
}

function isPlainText(content) {
  return content.length > 0 && !content.subarray(0, Math.min(content.length, 8000)).includes(0);
}

const DOCUMENT_SIGNATURES = new Map([
  ['application/pdf', { extensions: ['.pdf'], check: (c) => c.subarray(0, 5).toString('ascii') === '%PDF-' }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { extensions: ['.docx'], check: isZipContainer }],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { extensions: ['.xlsx'], check: isZipContainer }],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', { extensions: ['.pptx'], check: isZipContainer }],
  ['application/zip', { extensions: ['.zip'], check: isZipContainer }],
  ['text/plain', { extensions: ['.txt'], check: isPlainText }],
  ['text/csv', { extensions: ['.csv'], check: isPlainText }],
]);

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// Administradores globales y cualquier persona con acceso al módulo RH (el
// equipo que en la práctica redacta los avisos de la empresa).
function newsManagerOnly(req, res, next) {
  if (req.user?.role === 'administrator' || req.user?.allowed_modules?.includes('rh')) return next();
  return res.status(403).json({ error: 'Sólo Recursos Humanos o un administrador global pueden gestionar noticias de la empresa' });
}

function validateAttachmentContent(mimeType, content, filename) {
  if (!Buffer.isBuffer(content) || content.length === 0) throw httpError(400, 'Selecciona un archivo con contenido');
  if (content.length > MAX_ATTACHMENT_SIZE) throw httpError(413, 'El archivo excede el límite de 20 MB');
  if (IMAGE_MIME_TYPES.has(mimeType)) return validateImageContent(mimeType, content, filename);
  const definition = DOCUMENT_SIGNATURES.get(mimeType);
  if (!definition) throw httpError(415, 'Formato no permitido. Usa PDF, Word, Excel, PowerPoint, ZIP, TXT, CSV o una imagen');
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (!definition.extensions.includes(extension)) throw httpError(400, 'La extensión no coincide con el tipo de archivo');
  if (!definition.check(content)) throw httpError(400, 'El contenido no corresponde a un archivo válido de este tipo');
}

function serializeNews(row, includeManagementInfo) {
  const news = {
    id: row.id,
    title: row.title,
    body: row.body,
    published_at: row.published_at,
    attachment: row.attachment_id ? {
      id: row.attachment_id,
      original_filename: row.attachment_filename,
      mime_type: row.attachment_mime_type,
      file_size: Number(row.attachment_file_size),
      content_url: `/api/portal/v1/company-news/${row.id}/attachment/content`,
    } : null,
  };
  // Quién la escribió y quién la editó sólo le importa a quien administra
  // noticias; la portada pública nunca lo expone.
  if (includeManagementInfo) {
    news.author_name = row.author_name;
    news.updated_at = row.updated_at;
    news.updated_by_name = row.updated_by_name;
  }
  return news;
}

function serializeArchivedNews(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    published_at: row.published_at,
    author_name: row.author_name,
    updated_at: row.updated_at,
    updated_by_name: row.updated_by_name,
    archived_at: row.archived_at,
    archived_by_name: row.archived_by_name,
    attachment: row.attachment_id ? {
      id: row.attachment_id,
      original_filename: row.attachment_filename,
      mime_type: row.attachment_mime_type,
      file_size: Number(row.attachment_file_size),
      content_url: `/api/portal/v1/company-news/${row.id}/attachment/content`,
    } : null,
  };
}

// Sin token (o uno inválido/sin permiso) sigue siendo una respuesta pública
// válida: sólo cambia si incluye o no los datos de autoría/edición.
async function canManageNews(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const profile = await findProfileIdentity(payload.sub);
    return Boolean(profile?.is_active) && (profile.role === 'administrator' || profile.allowed_modules?.includes('rh'));
  } catch {
    return false;
  }
}

// Público a propósito: la portada muestra noticias antes de iniciar sesión.
companyNewsRouter.get('/company-news', async (req, res, next) => {
  try {
    const includeManagementInfo = await canManageNews(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const [rows] = await pool.query(
      `SELECT n.id, n.title, n.body, n.published_at, n.updated_at, u.full_name AS author_name,
              updater.full_name AS updated_by_name,
              a.id AS attachment_id, a.original_filename AS attachment_filename,
              a.mime_type AS attachment_mime_type, a.file_size AS attachment_file_size
         FROM company_news n
         JOIN user_profiles u ON u.id = n.author_user_id
         LEFT JOIN user_profiles updater ON updater.id = n.updated_by_user_id
         LEFT JOIN company_news_attachments a ON a.news_id = n.id
        WHERE n.archived_at IS NULL
        ORDER BY n.sort_order ASC, n.published_at DESC
        LIMIT ?`,
      [limit]
    );
    res.set('Cache-Control', 'no-store').json({ data: rows.map((row) => serializeNews(row, includeManagementInfo)) });
  } catch (error) {
    next(error);
  }
});

// Público a propósito: la página de detalle de un aviso no requiere sesión.
companyNewsRouter.get('/company-news/:id', async (req, res, next) => {
  try {
    const includeManagementInfo = await canManageNews(req);
    const [[row]] = await pool.query(
      `SELECT n.id, n.title, n.body, n.published_at, n.updated_at, u.full_name AS author_name,
              updater.full_name AS updated_by_name,
              a.id AS attachment_id, a.original_filename AS attachment_filename,
              a.mime_type AS attachment_mime_type, a.file_size AS attachment_file_size
         FROM company_news n
         JOIN user_profiles u ON u.id = n.author_user_id
         LEFT JOIN user_profiles updater ON updater.id = n.updated_by_user_id
         LEFT JOIN company_news_attachments a ON a.news_id = n.id
        WHERE n.id = ? AND n.archived_at IS NULL`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Noticia no encontrada' });
    res.set('Cache-Control', 'no-store').json({ data: serializeNews(row, includeManagementInfo) });
  } catch (error) {
    next(error);
  }
});

companyNewsRouter.get('/company-news/:id/attachment/content', async (req, res, next) => {
  try {
    const [[attachment]] = await pool.query(
      `SELECT a.original_filename, a.mime_type, a.file_size, a.checksum_sha256, a.content, n.archived_at
         FROM company_news_attachments a
         JOIN company_news n ON n.id = a.news_id
        WHERE a.news_id = ?`,
      [req.params.id]
    );
    // Activa: descarga pública. Archivada: sólo quien administra noticias
    // puede verla, desde el histórico. En ambos casos "no encontrado" si no aplica.
    if (!attachment || (attachment.archived_at && !(await canManageNews(req)))) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    const asciiName = attachment.original_filename.replace(/[^A-Za-z0-9._-]/g, '_');
    res.set({
      'Content-Type': attachment.mime_type,
      'Content-Length': String(attachment.file_size),
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.original_filename)}`,
      'Cache-Control': 'public, no-cache',
      ETag: `"${attachment.checksum_sha256}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(attachment.content);
  } catch (error) {
    next(error);
  }
});

companyNewsRouter.post('/admin/company-news', authRequired, newsManagerOnly, async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title) throw httpError(400, 'Escribe un título');
    if (title.length > MAX_TITLE_LENGTH) throw httpError(400, `El título excede ${MAX_TITLE_LENGTH} caracteres`);
    if (!body) throw httpError(400, 'Escribe el contenido de la noticia');
    if (body.length > MAX_BODY_LENGTH) throw httpError(400, `El contenido excede ${MAX_BODY_LENGTH} caracteres`);
    const id = randomUUID();
    // Las noticias nuevas aparecen primero por defecto (número menor que
    // cualquier otra activa) hasta que alguien reordene manualmente.
    await pool.query(
      `INSERT INTO company_news (id, author_user_id, title, body, sort_order)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MIN(sort_order), 1) - 1 FROM company_news c WHERE c.archived_at IS NULL))`,
      [id, req.user.id, title, body]
    );
    await recordAudit({ req, action: 'company_news.created', entityType: 'company_news', entityId: id, metadata: { title } });
    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

companyNewsRouter.patch('/admin/company-news/:id', authRequired, newsManagerOnly, async (req, res, next) => {
  try {
    const [[news]] = await pool.query('SELECT id FROM company_news WHERE id = ? AND archived_at IS NULL', [req.params.id]);
    if (!news) return res.status(404).json({ error: 'Noticia no encontrada' });
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title) throw httpError(400, 'Escribe un título');
    if (title.length > MAX_TITLE_LENGTH) throw httpError(400, `El título excede ${MAX_TITLE_LENGTH} caracteres`);
    if (!body) throw httpError(400, 'Escribe el contenido de la noticia');
    if (body.length > MAX_BODY_LENGTH) throw httpError(400, `El contenido excede ${MAX_BODY_LENGTH} caracteres`);
    await pool.query(
      'UPDATE company_news SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP, updated_by_user_id = ? WHERE id = ?',
      [title, body, req.user.id, news.id]
    );
    await recordAudit({ req, action: 'company_news.updated', entityType: 'company_news', entityId: news.id, metadata: { title } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

companyNewsRouter.put('/admin/company-news/order', authRequired, newsManagerOnly, async (req, res, next) => {
  try {
    const order = Array.isArray(req.body?.order) ? req.body.order.map(String) : null;
    if (!order || !order.length) throw httpError(400, 'Proporciona el orden de las noticias');
    const [rows] = await pool.query('SELECT id FROM company_news WHERE archived_at IS NULL');
    const currentIds = new Set(rows.map((row) => row.id));
    if (order.length !== currentIds.size || !order.every((id) => currentIds.has(id))) {
      throw httpError(400, 'El orden no coincide con las noticias activas');
    }
    await Promise.all(order.map((id, index) => pool.query('UPDATE company_news SET sort_order = ? WHERE id = ?', [index + 1, id])));
    await recordAudit({ req, action: 'company_news.reordered', entityType: 'company_news', entityId: null, metadata: { order } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

companyNewsRouter.post(
  '/admin/company-news/:id/attachment',
  authRequired,
  newsManagerOnly,
  express.raw({ type: () => true, limit: MAX_ATTACHMENT_SIZE }),
  async (req, res, next) => {
    try {
      const [[news]] = await pool.query('SELECT id FROM company_news WHERE id = ? AND archived_at IS NULL', [req.params.id]);
      if (!news) throw httpError(404, 'Noticia no encontrada');
      const [[existing]] = await pool.query('SELECT id FROM company_news_attachments WHERE news_id = ?', [news.id]);
      if (existing) throw httpError(409, 'Esta noticia ya tiene un archivo adjunto');
      const originalFilename = safeOriginalFilename(req.query.filename);
      const mimeType = String(req.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      validateAttachmentContent(mimeType, req.body, originalFilename);
      const attachmentId = randomUUID();
      const checksum = createHash('sha256').update(req.body).digest('hex');
      await pool.query(
        `INSERT INTO company_news_attachments
          (id, news_id, original_filename, mime_type, file_size, checksum_sha256, content)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [attachmentId, news.id, originalFilename, mimeType, req.body.length, checksum, req.body]
      );
      await recordAudit({
        req,
        action: 'company_news.attachment_added',
        entityType: 'company_news',
        entityId: news.id,
        metadata: { filename: originalFilename, mime_type: mimeType, file_size: req.body.length, checksum },
      });
      res.status(201).json({ id: attachmentId });
    } catch (error) {
      next(error);
    }
  }
);

companyNewsRouter.delete('/admin/company-news/:id', authRequired, newsManagerOnly, async (req, res, next) => {
  try {
    const [[news]] = await pool.query('SELECT id, title FROM company_news WHERE id = ? AND archived_at IS NULL', [req.params.id]);
    if (!news) return res.status(404).json({ error: 'Noticia no encontrada' });
    await pool.query('UPDATE company_news SET archived_at = CURRENT_TIMESTAMP, archived_by_user_id = ? WHERE id = ?', [req.user.id, news.id]);
    await recordAudit({ req, action: 'company_news.archived', entityType: 'company_news', entityId: news.id, metadata: { title: news.title } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Histórico: nunca público — sólo quien administra noticias consulta o
// restaura avisos quitados de la portada.
companyNewsRouter.get('/admin/company-news/archived', authRequired, newsManagerOnly, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const [rows] = await pool.query(
      `SELECT n.id, n.title, n.body, n.published_at, n.updated_at, n.archived_at,
              u.full_name AS author_name, updater.full_name AS updated_by_name, archiver.full_name AS archived_by_name,
              a.id AS attachment_id, a.original_filename AS attachment_filename,
              a.mime_type AS attachment_mime_type, a.file_size AS attachment_file_size
         FROM company_news n
         JOIN user_profiles u ON u.id = n.author_user_id
         LEFT JOIN user_profiles updater ON updater.id = n.updated_by_user_id
         LEFT JOIN user_profiles archiver ON archiver.id = n.archived_by_user_id
         LEFT JOIN company_news_attachments a ON a.news_id = n.id
        WHERE n.archived_at IS NOT NULL
        ORDER BY n.archived_at DESC
        LIMIT ?`,
      [limit]
    );
    res.set('Cache-Control', 'no-store').json({ data: rows.map(serializeArchivedNews) });
  } catch (error) {
    next(error);
  }
});

companyNewsRouter.put('/admin/company-news/:id/restore', authRequired, newsManagerOnly, async (req, res, next) => {
  try {
    const [[news]] = await pool.query('SELECT id, title FROM company_news WHERE id = ? AND archived_at IS NOT NULL', [req.params.id]);
    if (!news) return res.status(404).json({ error: 'Noticia archivada no encontrada' });
    // Reaparece primero en la portada, igual que una noticia nueva.
    const [[{ nextOrder }]] = await pool.query('SELECT COALESCE(MIN(sort_order), 1) - 1 AS nextOrder FROM company_news WHERE archived_at IS NULL');
    await pool.query(
      'UPDATE company_news SET archived_at = NULL, archived_by_user_id = NULL, sort_order = ? WHERE id = ?',
      [nextOrder, news.id]
    );
    await recordAudit({ req, action: 'company_news.restored', entityType: 'company_news', entityId: news.id, metadata: { title: news.title } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
