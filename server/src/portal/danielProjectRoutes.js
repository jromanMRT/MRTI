import { Router } from 'express';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authRequired } from '../auth/shared.js';

const files = JSON.parse(await readFile(new URL('./danielProjectFiles.json', import.meta.url), 'utf8'));
const defaultRoot = fileURLToPath(new URL('../../../../Applicaciones_Daniel/PROYECTOS/', import.meta.url));

// Lista cerrada: nunca se publica la carpeta completa, fuentes, ZIP ni datos sueltos.
export function createDanielProjectRouter({ authenticate = authRequired, root = process.env.DANIEL_PROJECTS_DIR || defaultRoot } = {}) {
  const router = Router();
  router.use('/daniel-projects', authenticate, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.user?.role !== 'administrator') return res.status(403).json({ error: 'Acceso reservado a administradores.' });
    next();
  });
  router.get('/daniel-projects', (_req, res) => res.json({ files }));
  router.get('/daniel-projects/content', async (req, res, next) => {
    if (typeof req.query.file !== 'string' || !files.includes(req.query.file)) {
      return res.status(404).json({ error: 'Proyecto no disponible.' });
    }
    try {
      const base = await realpath(root);
      const filename = await realpath(path.join(base, req.query.file));
      if (!filename.startsWith(base + path.sep)) return res.status(404).json({ error: 'Proyecto no disponible.' });
      // JSON para que el HTML sólo se ejecute dentro del visor aislado del frontend.
      res.json({ html: await readFile(filename, 'utf8') });
    } catch (error) {
      if (['ENOENT', 'EACCES'].includes(error.code)) return res.status(404).json({ error: 'El archivo del proyecto no está disponible.' });
      next(error);
    }
  });
  return router;
}

export const danielProjectRouter = createDanielProjectRouter();
