import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../auth/shared.js';
import { recordAudit } from '../audit.js';

export const companyHomeRouter = Router();

const MAX_FACTS = 8;
const MAX_FACT_LABEL = 40;
const MAX_FACT_VALUE = 120;

const DEFAULTS = Object.freeze({
  hero_eyebrow: 'Portal informativo',
  hero_title: 'Minera Río Tinto.',
  hero_subtitle: 'Información para todo el personal.',
  hero_body: 'Consulta los avisos y noticias oficiales de la empresa. Inicia sesión para entrar a tus aplicaciones según tu nivel de acceso.',
  facts: [],
  news_section_eyebrow: 'Últimos avisos',
  news_section_title: 'Noticias de la empresa',
  footer_tagline: 'La puerta de entrada digital de Minera Río Tinto',
});

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// Administradores globales y cualquier persona con acceso al módulo RH.
function newsManagerOnly(req, res, next) {
  if (req.user?.role === 'administrator' || req.user?.allowed_modules?.includes('rh')) return next();
  return res.status(403).json({ error: 'Sólo Recursos Humanos o un administrador global pueden editar la portada' });
}

function serializeSettings(row) {
  if (!row) return { ...DEFAULTS };
  // mysql2 ya devuelve las columnas JSON parseadas; sólo tolera el caso en
  // que llegara como texto (p. ej. otro driver o una fila cargada distinto).
  let facts = row.facts_json;
  if (typeof facts === 'string') {
    try { facts = JSON.parse(facts); } catch { facts = []; }
  }
  if (!Array.isArray(facts)) facts = [];
  return {
    hero_eyebrow: row.hero_eyebrow,
    hero_title: row.hero_title,
    hero_subtitle: row.hero_subtitle,
    hero_body: row.hero_body,
    facts,
    news_section_eyebrow: row.news_section_eyebrow,
    news_section_title: row.news_section_title,
    footer_tagline: row.footer_tagline,
  };
}

function textField(value, { label, required = false, max }) {
  const text = String(value ?? '').trim();
  if (required && !text) throw httpError(400, `${label} es obligatorio`);
  if (text.length > max) throw httpError(400, `${label} excede ${max} caracteres`);
  return text;
}

function validateFacts(value) {
  if (!Array.isArray(value)) throw httpError(400, 'Los datos de la empresa deben ser una lista');
  if (value.length > MAX_FACTS) throw httpError(400, `Usa como máximo ${MAX_FACTS} datos`);
  return value.map((fact, index) => ({
    label: textField(fact?.label, { label: `Etiqueta del dato ${index + 1}`, required: true, max: MAX_FACT_LABEL }),
    value: textField(fact?.value, { label: `Valor del dato ${index + 1}`, required: true, max: MAX_FACT_VALUE }),
  }));
}

// Público a propósito: define el contenido fijo de la portada, visible sin sesión.
companyHomeRouter.get('/company-home', async (_req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT * FROM company_home_settings WHERE id = 1');
    res.set('Cache-Control', 'no-store').json({ data: serializeSettings(row) });
  } catch (error) {
    next(error);
  }
});

companyHomeRouter.put('/admin/company-home', authRequired, newsManagerOnly, async (req, res, next) => {
  try {
    const [[current]] = await pool.query('SELECT * FROM company_home_settings WHERE id = 1');
    const heroEyebrow = textField(req.body?.hero_eyebrow, { label: 'El texto superior', required: true, max: 120 });
    const heroTitle = textField(req.body?.hero_title, { label: 'El título', required: true, max: 200 });
    const heroSubtitle = textField(req.body?.hero_subtitle, { label: 'El subtítulo', max: 200 });
    const heroBody = textField(req.body?.hero_body, { label: 'El texto de bienvenida', required: true, max: 600 });
    const facts = validateFacts(req.body?.facts || []);
    // Campos añadidos después: si una pantalla más antigua no los envía, se
    // conserva el valor guardado en lugar de borrarlo.
    const newsSectionEyebrow = req.body?.news_section_eyebrow === undefined
      ? current.news_section_eyebrow
      : textField(req.body.news_section_eyebrow, { label: 'El texto superior de noticias', required: true, max: 120 });
    const newsSectionTitle = req.body?.news_section_title === undefined
      ? current.news_section_title
      : textField(req.body.news_section_title, { label: 'El título de la sección de noticias', required: true, max: 160 });
    const footerTagline = req.body?.footer_tagline === undefined
      ? current.footer_tagline
      : textField(req.body.footer_tagline, { label: 'El texto del pie de página', required: true, max: 200 });
    await pool.query(
      `UPDATE company_home_settings
          SET hero_eyebrow = ?, hero_title = ?, hero_subtitle = ?, hero_body = ?, facts_json = ?,
              news_section_eyebrow = ?, news_section_title = ?, footer_tagline = ?, updated_by_user_id = ?
        WHERE id = 1`,
      [heroEyebrow, heroTitle, heroSubtitle, heroBody, JSON.stringify(facts), newsSectionEyebrow, newsSectionTitle, footerTagline, req.user.id]
    );
    await recordAudit({ req, action: 'company_home.updated', entityType: 'company_home_settings', entityId: '1' });
    const [[row]] = await pool.query('SELECT * FROM company_home_settings WHERE id = 1');
    res.json({ data: serializeSettings(row) });
  } catch (error) {
    next(error);
  }
});
