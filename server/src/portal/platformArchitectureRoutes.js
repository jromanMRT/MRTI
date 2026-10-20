import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, administratorOnly } from '../auth/shared.js';
import { recordAudit } from '../audit.js';

export const platformArchitectureRouter = Router();
const LIMIT = 40;

function fail(status, message) { return Object.assign(new Error(message), { status }); }
function normalizeMap(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'El mapa es inválido');
  const nodes = Array.isArray(input.nodes) ? input.nodes : null;
  const edges = Array.isArray(input.edges) ? input.edges : null;
  if (!nodes || !edges || nodes.length > LIMIT || edges.length > LIMIT * 3) throw fail(400, 'El mapa excede los límites permitidos');
  const ids = new Set();
  const cleanNodes = nodes.map((node) => {
    const id = String(node?.id || '').trim(); const label = String(node?.label || '').trim();
    if (!/^[a-z0-9-]{2,60}$/.test(id) || !label || label.length > 100 || ids.has(id)) throw fail(400, 'Cada módulo requiere un identificador y nombre únicos');
    ids.add(id);
    return { id, label, kind: String(node.kind || 'module').slice(0, 30), owner: String(node.owner || '').slice(0, 80), status: ['active', 'planned', 'migration', 'retired'].includes(node.status) ? node.status : 'active', responsibilities: Array.isArray(node.responsibilities) ? node.responsibilities.map((v) => String(v).trim()).filter(Boolean).slice(0, 12) : [] };
  });
  const cleanEdges = edges.map((edge) => {
    const from = String(edge?.from || ''); const to = String(edge?.to || '');
    if (!ids.has(from) || !ids.has(to) || from === to) throw fail(400, 'Una conexión debe unir dos módulos existentes');
    return { from, to, type: String(edge.type || 'api').slice(0, 40), label: String(edge.label || '').slice(0, 160) };
  });
  return { version: 1, title: String(input.title || 'Mapa de plataforma MRTI').slice(0, 120), nodes: cleanNodes, edges: cleanEdges };
}

platformArchitectureRouter.get('/admin/platform-architecture', authRequired, administratorOnly, async (_req, res, next) => {
  try {
    const [[row]] = await pool.query('SELECT map_json, updated_at, updated_by_user_id FROM platform_architecture_maps WHERE id = 1');
    if (!row) return res.status(503).json({ error: 'El mapa de plataforma aún no está inicializado' });
    const map = typeof row.map_json === 'string' ? JSON.parse(row.map_json) : row.map_json;
    res.set('Cache-Control', 'no-store').json({ data: { map, updated_at: row.updated_at, updated_by_user_id: row.updated_by_user_id } });
  } catch (error) { next(error); }
});

platformArchitectureRouter.put('/admin/platform-architecture', authRequired, administratorOnly, async (req, res, next) => {
  try {
    const map = normalizeMap(req.body?.map);
    await pool.query('UPDATE platform_architecture_maps SET map_json = ?, updated_by_user_id = ? WHERE id = 1', [JSON.stringify(map), req.user.id]);
    await recordAudit({ req, action: 'platform_architecture.updated', entityType: 'platform_architecture_maps', entityId: '1' });
    res.json({ data: { map } });
  } catch (error) { next(error); }
});
