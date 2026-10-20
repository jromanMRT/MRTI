// GENERADO desde MRTI-Platform@8ce8362 (src/release-contract.mjs).
// No editar aquí: cambiar en MRTI-Platform y ejecutar bin/sync.mjs.
// Contrato común de releases MRTI. Este módulo no publica ni modifica tráfico:
// valida la evidencia que deberán producir los adaptadores de cada runtime.

export const RELEASE_CONTRACT_VERSION = 1;

export const RELEASE_OPERATIONS = Object.freeze([
  'inspect', 'preflight', 'build', 'verify', 'promote', 'smoke', 'rollback',
]);

const MODULE_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;
const RELEASE_ID_PATTERN = /^\d{8}-\d{6}-[a-f0-9]{7,64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{7,64}$/i;

export class ReleaseContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseContractError';
  }
}

function requireObject(value, field) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new ReleaseContractError(`${field} debe ser un objeto`);
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ReleaseContractError(`${field} es obligatorio`);
  }
  return value.trim();
}

function requireDate(value, field) {
  const text = requireText(value, field);
  if (!Number.isFinite(Date.parse(text))) {
    throw new ReleaseContractError(`${field} debe ser una fecha ISO-8601 válida`);
  }
  return text;
}

// Valida el formato estricto que usarán los releases nuevos. Los manifests
// anteriores se pueden consultar desde health, pero no son promocionables bajo
// este contrato hasta migrarse explícitamente en la fase siguiente.
export function validateReleaseManifest(value) {
  const manifest = requireObject(value, 'release.json');
  if (manifest.schema_version !== RELEASE_CONTRACT_VERSION) {
    throw new ReleaseContractError(`schema_version debe ser ${RELEASE_CONTRACT_VERSION}`);
  }

  const module = requireText(manifest.module, 'module');
  if (!MODULE_PATTERN.test(module)) throw new ReleaseContractError('module tiene un formato inválido');

  const releaseId = requireText(manifest.release_id, 'release_id');
  if (!RELEASE_ID_PATTERN.test(releaseId)) throw new ReleaseContractError('release_id debe incluir fecha, hora y commit');

  const commit = requireText(manifest.commit, 'commit');
  if (!COMMIT_PATTERN.test(commit)) throw new ReleaseContractError('commit debe ser un SHA de Git');
  if (!releaseId.toLowerCase().endsWith(`-${commit.toLowerCase()}`)) {
    throw new ReleaseContractError('release_id debe terminar con el commit');
  }

  if (manifest.source_clean !== true) {
    throw new ReleaseContractError('source_clean debe ser true; no se permiten árboles sucios');
  }

  const artifact = requireObject(manifest.artifact, 'artifact');
  const artifactKind = requireText(artifact.kind, 'artifact.kind');
  if (!['static', 'oci', 'systemd'].includes(artifactKind)) {
    throw new ReleaseContractError('artifact.kind debe ser static, oci o systemd');
  }
  const artifactReference = requireText(artifact.reference, 'artifact.reference');
  if (artifactKind === 'oci' && !/^sha256:[a-f0-9]{64}$/i.test(artifactReference)) {
    throw new ReleaseContractError('artifact.reference debe ser un digest sha256 para OCI');
  }

  if (!Array.isArray(manifest.tests) || manifest.tests.length === 0) {
    throw new ReleaseContractError('tests debe incluir al menos una prueba aprobada');
  }
  const tests = manifest.tests.map((test, index) => {
    requireObject(test, `tests[${index}]`);
    const name = requireText(test.name, `tests[${index}].name`);
    if (test.status !== 'passed') throw new ReleaseContractError(`tests[${index}].status debe ser passed`);
    return { name, status: 'passed' };
  });

  const publicPath = requireText(manifest.public_path, 'public_path');
  if (!publicPath.startsWith('/') || !publicPath.endsWith('/')) {
    throw new ReleaseContractError('public_path debe iniciar y terminar con /');
  }

  return {
    schema_version: RELEASE_CONTRACT_VERSION,
    module,
    release_id: releaseId,
    commit,
    source_clean: true,
    built_at: requireDate(manifest.built_at, 'built_at'),
    builder: requireText(manifest.builder, 'builder'),
    artifact: { kind: artifactKind, reference: artifactReference },
    tests,
    public_path: publicPath,
  };
}

// Extrae una identidad segura para health. Acepta manifests históricos para
// no degradar el monitoreo durante la migración gradual del esquema.
export function releaseIdentity(manifest, fallbackReleaseId = null) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { release_id: fallbackReleaseId, metadata: 'missing' };
  }
  const releaseId = manifest.release_id || manifest.id || fallbackReleaseId;
  const commit = typeof manifest.commit === 'string' ? manifest.commit : null;
  const artifact = manifest.artifact && typeof manifest.artifact === 'object'
    ? { kind: manifest.artifact.kind ?? null, reference: manifest.artifact.reference ?? null }
    : null;
  return {
    release_id: releaseId,
    commit,
    artifact,
    metadata: manifest.emergency ? 'emergency' : manifest.schema_version === RELEASE_CONTRACT_VERSION ? 'contract-v1' : 'legacy',
  };
}

export function assertReleaseAdapter(adapter, name = 'adaptador') {
  requireObject(adapter, name);
  for (const operation of RELEASE_OPERATIONS) {
    if (typeof adapter[operation] !== 'function') {
      throw new ReleaseContractError(`${name} no implementa ${operation}()`);
    }
  }
  return adapter;
}

export async function invokeReleaseOperation(adapter, operation, ...args) {
  assertReleaseAdapter(adapter);
  if (!RELEASE_OPERATIONS.includes(operation)) {
    throw new ReleaseContractError(`operación de release desconocida: ${operation}`);
  }
  return adapter[operation](...args);
}
