#!/usr/bin/env node
// GENERADO desde MRTI-Platform@363afc8 (src/release.mjs).
// No editar aquí: cambiar en MRTI-Platform y ejecutar bin/sync.mjs.
// Publicación de frontends MRTI por releases inmutables.
//
// Nginx sirve `<repo>/dist`. Con esta herramienta `dist` es un symlink hacia
// `releases/<id>/`; cada build se genera en un release nuevo, se verifica y
// sólo entonces se promueve cambiando el symlink de forma atómica. El release
// anterior se conserva para rollback inmediato.
//
// Uso (desde la raíz del repo, normalmente vía npm scripts):
//   release.mjs adopt              convierte el dist/ actual en el primer release
//   release.mjs build              genera y verifica un release, NO lo publica
//   release.mjs promote [id]       publica el release indicado (o el más nuevo)
//   release.mjs publish            build + promote
//   release.mjs rollback           vuelve al release anterior
//   release.mjs preview [id]       sirve un release con `vite preview`
//   release.mjs list | status      muestra releases y el publicado
//
// Configuración en package.json: "mrtiRelease": { "publicPath": "/rh/", "keep": 3 }
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync,
  renameSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ID_PATTERN = /^\d{8}-\d{6}(-[a-z0-9]+)*$/;

export function releaseId(date, commit, dirty) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return [stamp, commit, dirty ? 'dirty' : null].filter(Boolean).join('-');
}

// Referencias locales (src/href) del index.html que deben existir en el release.
export function localReferences(html, publicPath) {
  const refs = new Set();
  for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    let ref = match[1].split(/[?#]/)[0];
    if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) continue;
    if (ref.startsWith(publicPath)) ref = ref.slice(publicPath.length);
    else if (ref.startsWith('/')) continue; // ruta de otro location de Nginx
    ref = ref.replace(/^\.\//, '');
    if (ref) refs.add(ref);
  }
  return [...refs];
}

export function verifyRelease(dir, publicPath) {
  const problems = [];
  const indexPath = path.join(dir, 'index.html');
  if (!existsSync(indexPath)) return ['falta index.html'];
  const refs = localReferences(readFileSync(indexPath, 'utf8'), publicPath);
  for (const ref of refs) {
    const file = path.join(dir, ref);
    if (!file.startsWith(dir + path.sep)) problems.push(`referencia fuera del release: ${ref}`);
    else if (!existsSync(file)) problems.push(`index.html referencia un archivo inexistente: ${ref}`);
    else if (statSync(file).isFile() && statSync(file).size === 0) problems.push(`archivo vacío: ${ref}`);
  }
  if (!refs.some((ref) => ref.endsWith('.js'))) problems.push('index.html no carga ningún script');
  return problems;
}

// Archivos bajo assets/ de un release, relativos a la raíz del release.
export function listAssets(dir) {
  const assetsDir = path.join(dir, 'assets');
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath ?? entry.path, entry.name)));
}

// Las pestañas abiertas conservan el bundle anterior y pueden pedir después un
// chunk lazy. El release nuevo incluye los assets propios del publicado (con
// hash, nunca colisionan) para que esas sesiones sigan funcionando un deploy
// más. Sólo se copian los propios, así el tamaño no crece sin límite.
export function carryOverAssets(fromDir, toDir) {
  const meta = path.join(fromDir, 'release.json');
  const own = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')).ownAssets : null;
  let carried = 0;
  for (const rel of own || listAssets(fromDir)) {
    const source = path.join(fromDir, rel);
    const target = path.join(toDir, rel);
    if (existsSync(target) || !existsSync(source)) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    carried += 1;
  }
  return carried;
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

export function createReleaser({ root = process.cwd(), log = console.log, fetchImpl = (...a) => fetch(...a), smokeOrigin = process.env.MRTI_RELEASE_SMOKE_ORIGIN || 'http://127.0.0.1' } = {}) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = { publicPath: '/', keep: 3, ...(pkg.mrtiRelease || {}) };
  const releasesDir = path.join(root, 'releases');
  const distPath = path.join(root, 'dist');
  const statePath = path.join(releasesDir, 'state.json');

  const readState = () => (existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { current: null, previous: null });
  const writeState = (state) => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const releaseDir = (id) => path.join(releasesDir, id);

  function listReleases() {
    if (!existsSync(releasesDir)) return [];
    return readdirSync(releasesDir).filter((name) => ID_PATTERN.test(name) && statSync(releaseDir(name)).isDirectory()).sort();
  }

  function currentFromLink() {
    const stat = lstatSync(distPath, { throwIfNoEntry: false });
    if (!stat?.isSymbolicLink()) return null;
    return path.basename(readlinkSync(distPath));
  }

  // La primera vez `dist` es un directorio real: se conserva como release
  // "inicial" para poder regresar a él.
  function adoptExistingDist() {
    const stat = lstatSync(distPath, { throwIfNoEntry: false });
    if (!stat || stat.isSymbolicLink()) return null;
    const id = releaseId(new Date(), 'inicial', false);
    mkdirSync(releasesDir, { recursive: true });
    renameSync(distPath, releaseDir(id));
    writeFileSync(path.join(releaseDir(id), 'release.json'), `${JSON.stringify({ id, adopted: true, adoptedAt: new Date().toISOString() }, null, 2)}\n`);
    log(`dist/ existente conservado como releases/${id}`);
    return id;
  }

  function pointDistTo(id) {
    const tmp = path.join(root, `.dist-${process.pid}`);
    rmSync(tmp, { force: true });
    symlinkSync(path.join('releases', id), tmp);
    renameSync(tmp, distPath); // rename(2) sobre un symlink es atómico
  }

  function build() {
    const commit = git(root, ['rev-parse', '--short', 'HEAD']) || 'nogit';
    const dirty = git(root, ['status', '--porcelain']) !== '';
    const id = releaseId(new Date(), commit, dirty);
    const outDir = releaseDir(id);
    mkdirSync(releasesDir, { recursive: true });
    log(`Construyendo release ${id}${dirty ? ' (hay cambios sin commit)' : ''}...`);
    const result = spawnSync('npx', ['--no-install', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) {
      rmSync(outDir, { recursive: true, force: true });
      throw new Error('vite build falló; no se creó el release');
    }
    const problems = verifyRelease(outDir, config.publicPath);
    if (problems.length) {
      rmSync(outDir, { recursive: true, force: true });
      throw new Error(`El release no pasó la verificación:\n  - ${problems.join('\n  - ')}`);
    }
    const ownAssets = listAssets(outDir);
    const published = lstatSync(distPath, { throwIfNoEntry: false }) ? distPath : null;
    const carried = published ? carryOverAssets(published, outDir) : 0;
    writeFileSync(path.join(outDir, 'release.json'), `${JSON.stringify({ id, commit, dirty, builtAt: new Date().toISOString(), node: process.version, ownAssets, carriedAssets: carried }, null, 2)}\n`);
    log(`Release ${id} listo y verificado${carried ? ` (${carried} assets del publicado se conservan para sesiones abiertas)` : ''}. Aún NO está publicado.`);
    return id;
  }

  async function smoke(id) {
    const base = `${smokeOrigin}${config.publicPath}`;
    const response = await fetchImpl(base, { redirect: 'follow', signal: AbortSignal.timeout(5000) });
    if (response.status !== 200) throw new Error(`${base} respondió ${response.status}`);
    const served = await response.text();
    const expected = readFileSync(path.join(releaseDir(id), 'index.html'), 'utf8');
    if (served !== expected) throw new Error(`${base} no sirve el index.html del release ${id}`);
    const script = localReferences(expected, config.publicPath).find((ref) => ref.endsWith('.js'));
    const asset = await fetchImpl(`${base}${script}`, { signal: AbortSignal.timeout(5000) });
    if (asset.status !== 200) throw new Error(`${base}${script} respondió ${asset.status}`);
    log(`Smoke OK: ${base} y ${script}`);
  }

  function prune(state) {
    const keep = new Set(listReleases().slice(-config.keep));
    if (state.current) keep.add(state.current);
    if (state.previous) keep.add(state.previous);
    for (const id of listReleases()) {
      if (keep.has(id)) continue;
      rmSync(releaseDir(id), { recursive: true, force: true });
      log(`Release antiguo eliminado: ${id}`);
    }
  }

  async function switchTo(id, { skipSmoke = false, reason = 'promote' } = {}) {
    if (!ID_PATTERN.test(id) || !existsSync(releaseDir(id))) throw new Error(`No existe el release ${id}`);
    const problems = verifyRelease(releaseDir(id), config.publicPath);
    if (problems.length) throw new Error(`El release ${id} no pasó la verificación:\n  - ${problems.join('\n  - ')}`);

    const adopted = adoptExistingDist();
    const state = readState();
    const before = currentFromLink() || adopted || state.current;
    if (before === id) {
      log(`El release ${id} ya está publicado.`);
      return id;
    }
    pointDistTo(id);
    const next = { current: id, previous: before, updatedAt: new Date().toISOString(), reason };
    writeState(next);
    log(`Publicado: ${id}${before ? ` (anterior: ${before})` : ''}`);

    if (!skipSmoke) {
      try {
        await smoke(id);
      } catch (err) {
        if (before) {
          pointDistTo(before);
          writeState({ current: before, previous: id, updatedAt: new Date().toISOString(), reason: 'rollback automático' });
          log(`Smoke falló; se restauró ${before}.`);
        }
        throw err;
      }
    }
    prune(next);
    return id;
  }

  // Pasa al esquema de releases sin cambiar lo que se sirve: el dist/ actual
  // se convierte en el primer release y dist pasa a ser el symlink.
  async function adopt({ skipSmoke = false } = {}) {
    const current = currentFromLink();
    if (current) {
      log(`dist ya usa releases (publicado: ${current}).`);
      return current;
    }
    const id = adoptExistingDist();
    if (!id) throw new Error('No existe dist/ para adoptar.');
    pointDistTo(id);
    writeState({ current: id, previous: null, updatedAt: new Date().toISOString(), reason: 'adopt' });
    log(`dist → releases/${id}`);
    if (!skipSmoke) await smoke(id);
    return id;
  }

  async function promote(id, options) {
    const target = id || listReleases().filter((name) => name !== currentFromLink()).at(-1);
    if (!target) throw new Error('No hay releases para publicar; ejecuta primero el build.');
    return switchTo(target, options);
  }

  async function rollback(options) {
    const state = readState();
    if (!state.previous) throw new Error('No hay release anterior registrado.');
    return switchTo(state.previous, { ...options, reason: 'rollback' });
  }

  function status() {
    const current = currentFromLink();
    const state = readState();
    const lines = listReleases().map((id) => {
      const mark = id === current ? '* publicado' : id === state.previous ? '  anterior' : '';
      return `${id.padEnd(40)} ${mark}`;
    });
    if (!current) lines.unshift(existsSync(distPath) ? 'dist/ es un directorio real (aún no se usa el esquema de releases)' : 'dist/ no existe');
    return lines.join('\n');
  }

  function preview(id) {
    const target = id || currentFromLink() || listReleases().at(-1);
    if (!target) throw new Error('No hay releases.');
    log(`Sirviendo ${target} con vite preview (Ctrl+C para terminar)`);
    spawnSync('npx', ['--no-install', 'vite', 'preview', '--outDir', releaseDir(target), ...process.argv.slice(4)], { cwd: root, stdio: 'inherit' });
  }

  return { config, adopt, build, promote, rollback, status, preview, listReleases };
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  const skipSmoke = process.argv.includes('--no-smoke');
  const releaser = createReleaser();
  switch (command) {
    case 'adopt': await releaser.adopt({ skipSmoke }); break;
    case 'build': releaser.build(); break;
    case 'promote': await releaser.promote(arg && !arg.startsWith('--') ? arg : undefined, { skipSmoke }); break;
    case 'publish': await releaser.promote(releaser.build(), { skipSmoke }); break;
    case 'rollback': await releaser.rollback({ skipSmoke }); break;
    case 'preview': releaser.preview(arg && !arg.startsWith('--') ? arg : undefined); break;
    case 'list':
    case 'status': console.log(releaser.status()); break;
    default:
      console.log('Uso: release.mjs adopt | build | promote [id] | publish | rollback | preview [id] | status  [--no-smoke]');
      process.exitCode = command ? 1 : 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\n✖ ${err.message}`);
    process.exitCode = 1;
  });
}
