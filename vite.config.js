import { defineConfig } from 'vite';

export default defineConfig({
  // `dist/` es el symlink que sirve Nginx, así que un `vite build` directo
  // escribe en build-local/ y nunca en lo publicado. Para publicar se usa `npm run build` / `npm run release`
  // (MRTI-Platform release.mjs), que pasa su propio --outDir.
  build: {
    outDir: 'build-local',
  },
});
