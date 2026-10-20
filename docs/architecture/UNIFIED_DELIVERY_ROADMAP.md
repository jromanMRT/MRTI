# Hoja de ruta de entrega confiable y operación de MRTI

Estado: **propuesta operativa — no inicia despliegues por sí misma**  
Fecha: 2026-10-14  
Dueño de la decisión: Administración de Plataforma MRTI  
Complementa: [SERVICE_BOUNDARIES.md](SERVICE_BOUNDARIES.md), [CORE_INFRA_MIGRATION_GUIDE.md](CORE_INFRA_MIGRATION_GUIDE.md) y [MRTI-Platform/README.md](../../../MRTI-Platform/README.md).

## 1. Resultado que se busca

Que una persona o una IA pueda publicar, verificar y revertir **cualquier
módulo** mediante el mismo contrato operativo:

```text
preflight → build inmutable → pruebas → revisión → promoción atómica
→ smoke publicado → observación → rollback inmediato si falla
```

La uniformidad requerida es de **operación, evidencia y seguridad**, no de
tecnología interna. Un frontend estático puede conservar releases con symlink
y Tickets puede conservar contenedores Docker mientras ambos respondan a los
mismos comandos, produzcan un artefacto identificable y tengan rollback
verificable.

No se adopta Kubernetes en este plan. No hay evidencia de carga, número de
hosts o equipo de operación que justifique esa complejidad. Docker Compose,
imágenes OCI inmutables, Nginx, PM2 durante transición y una automatización
pequeña y auditable son el objetivo de largo plazo.

## 2. Principios no negociables

1. **No publicar desde un árbol sucio.** Un artefacto debe corresponder a un
   commit identificado. La excepción temporal actual de releases `-dirty` se
   retira después de la fase 2.
2. **No despliegue masivo.** Cada módulo pasa por expandir, probar, promover,
   observar y sólo después retirar la vía previa.
3. **Sin cambio de propietarios ni de contratos de negocio.** Este programa
   modifica el vehículo de entrega, no los dueños de datos, UUID, rutas ni
   autorización.
4. **Una sola promoción cambia producción.** Compilar nunca publica.
5. **Todo cambio tiene reversa concreta y ensayada.** Revertir código no es
   suficiente: debe poder restaurarse el artefacto anterior y comprobarse.
6. **Secretos fuera del repositorio, la imagen y los logs.** Nunca ejecutar
   `docker compose config` sin `--quiet` si puede interpolar valores reales.
7. **Evidencia durable.** Cada promoción registra commit/digest, operador,
   hora, smoke, release previo y resultado de observación.
8. **Menor privilegio.** La cuenta que publica no administra bases ni rota
   secretos; el runtime no corre como root salvo una justificación documentada.
9. **Compatibilidad antes de retiro.** PM2, symlinks o imágenes anteriores se
   conservan hasta superar el periodo de observación definido en cada fase.
10. **Sin `push`, rotación de secretos o eliminación de mecanismos antiguos**
    por defecto. Requieren autorización expresa y evidencia de compatibilidad.

## 3. Glosario y contrato común

| Término | Definición obligatoria |
|---|---|
| Artefacto | Directorio de frontend o imagen OCI construida una sola vez, identificado por commit y checksum/digest. |
| Build | Creación local o CI del artefacto. No modifica tráfico de usuarios. |
| Promote | Cambio atómico de la versión que atiende producción. |
| Smoke | Prueba contra la URL publicada, no contra un archivo local o puerto de desarrollo. |
| Rollback | Promoción explícita del artefacto anterior conocido; no reconstruir desde la rama actual. |
| Release ID | `fecha-hora-commit`; nunca usar `latest` como única identidad. |
| Ventana de observación | Periodo definido para revisar health, 5xx, 401 inesperados y logs antes de retirar el camino previo. |

### 3.1 Interfaz objetivo por módulo

Todo módulo deberá exponer, aunque internamente use symlink, Docker o systemd:

```bash
npm run release:preflight  # sólo lectura: árbol, commit, dependencias, config y espacio
npm run release:build      # produce un artefacto identificado; no publica
npm run release:verify     # pruebas y smoke aislado del artefacto
npm run release:status     # artefacto actual, anterior y candidato
npm run release:promote -- <id>
npm run release:rollback
```

Mientras se implementa, los nombres temporales existentes se documentan en la
matriz de la sección 5. La fase 4 crea adaptadores para que Tickets y los
frontends estáticos acepten la misma interfaz.

### 3.2 Metadatos mínimos de un artefacto

Todo release debe poder mostrar o guardar un `release.json` (o etiqueta OCI
equivalente) con:

```json
{
  "module": "activos",
  "release_id": "20261014-153000-a1b2c3d",
  "commit": "a1b2c3d",
  "source_clean": true,
  "built_at": "2026-10-14T21:30:00Z",
  "builder": "ci|usuario-autorizado",
  "artifact": "ruta o digest sha256",
  "tests": [{ "name": "build", "status": "passed" }],
  "public_path": "/activos/"
}
```

No incluir variables de entorno, tokens, contraseñas, cabeceras ni datos de
usuarios.

## 4. Regla de avance y marcado

- `[ ]` no iniciada.
- `[-]` en curso: debe incluir fecha, responsable, bloqueador y siguiente
  evidencia pendiente.
- `[x]` terminada: debe incluir fecha, commits, artefacto y prueba verificable.
- `[!]` bloqueada: sólo cuando se agotaron alternativas seguras y se requiere
  una decisión externa concreta.

Una IA que ejecute esta hoja de ruta debe:

1. Leer por completo este documento, `SERVICE_BOUNDARIES.md` y la guía Core /
   Infra antes de editar configuración de despliegue.
2. Ejecutar `git status --short` en **todos** los repositorios alcanzados y no
   mezclar modificaciones ajenas.
3. Trabajar una fase y un módulo piloto por vez.
4. Ejecutar las pruebas indicadas, conservar la salida relevante sin secretos
   y actualizar la bitácora de la sección 13.
5. Crear commits independientes por repositorio cuando una fase ya esté
   verificada. No hacer `push` sin autorización explícita.
6. No marcar un punto como `[x]` por tener código escrito: requiere evidencia
   de los criterios de terminado.

## 5. Inventario inicial y objetivo por módulo

Este inventario es punto de partida; debe comprobarse en la fase 0, no asumirse
como fotografía de producción.

| Módulo | Runtime actual | Entrega actual | Objetivo intermedio | Estado inicial |
|---|---|---|---|---|
| Core | PM2, puerto 3005 | frontend con `mrti-release` | release común + API contenible probada en paralelo | `[-]` frontend sí; corte API a Docker no ejecutado |
| MRTI-Obs | PM2, 3002 | frontend con `mrti-release` | release común + runtime documentado | `[-]` |
| Activos | PM2, 3003 | frontend con `mrti-release` | release común + runtime documentado | `[-]` |
| RH | PM2, 3004 | frontend con `mrti-release` | release común + runtime documentado | `[-]` |
| Legal | PM2, 3006 | frontend con `mrti-release` | release común + runtime documentado | `[-]` |
| SAP | PM2, 3008 | declarado con releases en Platform | confirmar adopción y smoke | `[ ]` |
| Mantenimiento | PM2, 3009 | declarado con releases en Platform | confirmar adopción y smoke | `[ ]` |
| Tickets | Docker, 4000/4173 | `docker compose up --build` | adaptador de release Docker con digest y rollback | `[-]` |
| Monitor | systemd, 8477 | binario/recursos embebidos | contrato de versión, health y rollback de unidad/binario | `[ ]` |
| Agent Core | PM2, 3007 | backend sin frontend propio confirmado | incluir en health/release de backend | `[ ]` |

## 6. Fase 0 — Línea base y control de cambios

Objetivo: saber exactamente qué se publica hoy y asegurar que un cambio de
entrega no destruya la capacidad de volver atrás.

### Tareas

- [-] 2026-10-14 — Nombrar un responsable técnico, un sustituto y un aprobador de
  promociones para cada módulo de la tabla anterior.
- [x] 2026-10-14 — Crear un inventario de host, procesos PM2, unidades systemd, proyectos
  Compose, puertos, rutas Nginx, bases y rutas de health. No documentar
  secretos.
- [x] 2026-10-14 — Ejecutar y guardar la salida saneada de:

  ```bash
  cd /var/www/mrt/MRTI/MRTI-Platform
  node bin/health.mjs --json
  node bin/sync.mjs --check
  ```

- [x] 2026-10-14 — Por cada repositorio, registrar `git rev-parse --short HEAD`,
  `git status --short`, release/imagen actual y release/imagen anterior.
- [-] 2026-10-14 — Confirmar que el backup de cada base es recuperable y ejecutar una
  restauración en un entorno aislado. No restaurar sobre producción.
- [-] 2026-10-14 — Definir SLO iniciales: disponibilidad, tiempo máximo de recuperación
  (RTO), pérdida tolerable de datos (RPO), ventanas de mantenimiento y canal
  de incidentes.
- [-] 2026-10-14 — Definir el periodo de observación mínimo: 30 minutos para frontend
  aislado, 24 horas para cambio de backend o red, salvo una decisión de riesgo
  escrita.
- [-] 2026-10-14 — Crear un directorio privado o sistema de cambios para guardar evidencia
  de cada promoción; no usar el repositorio para logs que pudieran contener
  datos o secretos.

### Criterio de terminado

- Se puede responder, sin adivinar, qué versión atiende cada ruta pública y
  cómo regresar a su versión anterior.
- `health.mjs` no tiene fallos no explicados.
- Existe una persona responsable localizable por módulo.

### Rollback

No aplica: esta fase es de lectura, documentación y pruebas aisladas.

## 7. Fase 1 — Especificación del contrato de release

Objetivo: convertir el contrato de la sección 3 en código y documentación
compartidos en `MRTI-Platform`, sin cambiar aún producción.

### Tareas en `MRTI-Platform`

- [x] 2026-10-14 — Crear `docs/RELEASE_CONTRACT.md` con interfaces, códigos de salida,
  formato de evidencia y ejemplos para adaptadores estático/Docker/systemd.
- [x] 2026-10-14 — Añadir un esquema validable de `release.json` y pruebas unitarias que
  rechacen artefactos sin commit, con `source_clean=false` o sin resultados de
  pruebas.
- [x] 2026-10-14 — Diseñar una interfaz de adaptador:

  ```text
  inspect() → estado actual/anterior
  preflight() → valida sin escribir
  build() → artefacto inmutable
  verify(id) → comprueba artefacto aislado
  promote(id) → cambia tráfico de forma reversible
  smoke(id) → comprueba URL pública
  rollback() → promueve anterior conocido
  ```

- [x] 2026-10-14 — Hacer que `bin/health.mjs --json` incluya versión o digest publicado,
  no sólo health HTTP.
- [x] 2026-10-14 — Definir un formato de bloqueo de promoción por módulo para impedir dos
  publicaciones simultáneas. Debe expirar de forma segura y registrar dueño,
  PID y fecha; nunca dejar el sistema bloqueado indefinidamente.
- [x] 2026-10-14 — Definir una política de retención: mínimo tres artefactos recientes,
  actual, anterior y el último release estable conocido.
- [x] 2026-10-14 — Agregar una prueba que demuestre que fallo de smoke restaura el artefacto
  anterior.

### Criterio de terminado

- Pruebas de Platform pasan.
- El contrato tiene revisión y aprobación explícita de la administración de
  plataforma.
- No se cambia ningún symlink, contenedor, PM2 o unidad systemd real.

### Rollback

Revertir únicamente el commit de Platform; no hay tráfico modificado.

## 8. Fase 2 — Endurecer los releases estáticos existentes

Objetivo: hacer confiable el patrón ya existente para Core, Obs, Activos, RH y
Legal antes de extenderlo.

### Tareas

- [x] 2026-10-14 — Modificar `src/release.mjs` en Platform para rechazar por defecto un
  árbol Git sucio. Debe existir sólo una excepción explícita, auditada y de
  duración limitada para emergencia; nunca ser el camino normal.
- [ ] Separar scripts en cada frontend:

  ```json
  "release:preflight": "...",
  "release:build": "...",
  "release:verify": "...",
  "release:promote": "...",
  "release:rollback": "...",
  "release:status": "..."
  ```

- [ ] El preflight debe validar: Git limpio, rama/commit registrado,
  dependencias instaladas con lockfile, espacio suficiente, configuración de
  ruta pública, existencia de release actual y conectividad de smoke local.
- [ ] El build debe conservar assets del release anterior sólo según la regla
  documentada de sesiones con chunks lazy, y debe verificar que no hay rutas
  de assets fuera del directorio publicado.
- [ ] El promote debe exigir un release ya verificado, cambiar el symlink
  atómicamente, hacer smoke por Nginx y restaurar automáticamente si falla.
- [ ] Añadir pruebas para: base path erróneo, asset faltante, release repetido,
  fallo de smoke, rollback y retención.
- [ ] Ejecutar un ensayo build → promote → rollback → promote en un frontend
  de bajo riesgo con ventana aprobada. Documentar ID, hash y resultado.
- [ ] Adoptar SAP y Mantenimiento sólo después de confirmar que su `dist` y
  rutas Nginx actuales cumplen el contrato; no asumirlo porque aparezcan en
  `services.json`.

### Criterio de terminado

- Core, Obs, Activos, RH, Legal, SAP y Mantenimiento muestran `status`,
  producen `release.json` y pasan promoción/rollback comprobado.
- No hay release publicado marcado `dirty` salvo una excepción vigente y
  documentada.

### Rollback

Promover el release anterior mediante `release:rollback`. Si el cambio es al
propio releaser, conservar copia del script anterior y el symlink actual antes
del primer ensayo.

## 9. Fase 3 — CI de validación, sin publicación automática

Objetivo: impedir que código no verificable llegue al host de producción.

### Tareas

- [-] 2026-10-14 — Elegir el ejecutor de CI y almacenar sus credenciales fuera de Git.
- [x] 2026-10-14 — Preparar piloto sin secretos en GitHub Actions para MRTI-Platform; falta aprobarlo y extenderlo por módulo.
- [ ] Por cada repo, ejecutar en CI: instalación reproducible, lint/typecheck
  si existe, pruebas, build y `git diff --check`.
- [ ] Para frontend, generar el artefacto y validar referencias estáticas con
  la misma biblioteca de Platform; todavía no promover desde CI.
- [ ] Publicar reportes de pruebas, SBOM y resultados de análisis de
  vulnerabilidades como artefactos privados.
- [ ] Hacer que CI rechace: lockfile inconsistente, secretos detectados,
  dependencias vulnerables por encima del umbral acordado y build sin commit.
- [ ] Mantener una excepción temporal documentada para dependencias que no se
  puedan actualizar, con dueño y fecha límite.

### Criterio de terminado

- Un commit que falle no puede producir un candidato promovible.
- El mismo commit produce artefacto reproducible en dos ejecuciones.

### Rollback

Deshabilitar el workflow de CI; no existe promoción automática todavía.

## 10. Fase 4 — Adaptador Docker para Tickets

Objetivo: que Tickets tenga el mismo contrato operativo que los frontends
estáticos sin abandonar Docker.

### Tareas

- [x] 2026-10-14 — No usar `docker compose up --build` como comando normal de producción.
  Mantenerlo sólo para desarrollo o contingencia documentada.
- [x] 2026-10-14 — Ajustar Dockerfile para recibir etiquetas OCI: módulo, commit, fecha de
  build, versión y fuente del build. Nunca depender de `latest` para rollback.
- [ ] Preparar un registro privado de imágenes con TLS, control de acceso,
  retención y respaldo. Si aún no existe, documentar la solución temporal y
  su fecha de retiro.
- [ ] Crear un adaptador en Platform o Tickets que implemente:

  ```bash
  npm run release:preflight
  npm run release:build       # genera imagen tickets-frontend:<commit>
  npm run release:verify      # inicia candidato en puerto aislado y hace smoke
  npm run release:promote -- <digest-o-tag-inmutable>
  npm run release:rollback
  npm run release:status
  ```

- [x] 2026-10-14 — Generar un compose de producción que refiera un digest OCI, no un build
  context. El build ocurre antes de la promoción.
- [ ] Probar candidato en puerto distinto contra `/tickets/` y
  `/tickets-api/api/health`; validar además 401 sin sesión y una ruta de UI.
- [ ] Promover sólo `frontend` para cambios de UI; no recrear `backend` ni la
  base por defecto.
- [ ] Guardar el digest anterior antes de promover y ensayar rollback sin
  reconstruir la imagen.
- [ ] Documentar el comportamiento de sesiones y assets: una imagen nueva no
  debe romper pestañas abiertas que soliciten archivos con hash de la anterior.
  Si se requiere, Nginx debe conservar temporalmente assets versionados o la
  imagen anterior debe permanecer accesible hasta cerrar la ventana acordada.

### Criterio de terminado

- Tickets acepta todos los comandos de la sección 3.
- `status` muestra digest actual/anterior, commit, health y fecha.
- Se ejecutó un promote → smoke → rollback → smoke sin perder tickets,
  adjuntos ni datos de MySQL.

### Rollback

Cambiar la referencia de Compose al digest anterior y recrear **sólo** el
servicio afectado con `--no-deps --force-recreate`; confirmar health y UI.

## 11. Fase 5 — Observabilidad y evidencia de producción

Objetivo: detectar un despliegue defectuoso antes de que afecte a toda la
empresa y poder diagnosticarlo con rapidez.

### Tareas

- [ ] Estandarizar `GET /api/health` para que declare versión/commit y estado
  de dependencias propias, sin incluir secretos.
- [ ] Añadir endpoint o archivo de versión para cada frontend publicado.
- [-] 2026-10-14 — Propagar `X-Request-Id` en Tickets y comprobar que Nginx, Core y módulos lo registren en logs JSON.
  Tickets lo propagan a sus logs JSON.
- [ ] Centralizar o retener de forma controlada logs de Nginx, PM2, Docker y
  systemd; definir rotación para evitar llenar el disco.
- [ ] Crear tablero mínimo por módulo: disponibilidad, 5xx, 401/403 anómalos,
  latencia p95, reinicios, uso de disco y versión publicada.
- [ ] Crear alertas accionables con destinatario y runbook: caída de health,
  aumento de 5xx, falta de respaldo, disco bajo, contenedor reiniciando y
  certicado próximo a vencer.
- [ ] Definir smoke autenticado no destructivo mediante cuenta de prueba o
  permiso mínimo. Nunca usar cuentas humanas ni crear fixtures persistentes.
- [ ] Después de cada promoción, observar por el periodo definido y adjuntar
  evidencia al cambio antes de cerrar.

### Criterio de terminado

- Una persona puede asociar una solicitud fallida con versión, request ID y
  módulo en menos de 15 minutos.
- Alertas de prueba llegan al responsable sin exponer secretos.

### Rollback

Desactivar sólo la regla de alerta o dashboard defectuoso; no apagar la
instrumentación completa sin una investigación de incidente.

## 12. Fase 6 — Gestión de configuración, secretos y copias de seguridad

Objetivo: que reproducir o recuperar la plataforma no dependa de archivos
manuales opacos ni de secretos impresos por herramientas.

### Tareas

- [x] 2026-10-14 — Inventariar cada variable por módulo: nombre, dueño, entorno, si es
  secreto, consumidor y procedimiento de cambio. No registrar su valor.
- [ ] Elegir un almacén de secretos con control de acceso y auditoría; empezar
  con un módulo piloto.
- [ ] Sustituir `.env` copiados manualmente por inyección en runtime; las
  plantillas versionadas sólo contienen nombres y valores ficticios seguros.
- [x] 2026-10-14 — Añadir preflight reutilizable que falle si falta una variable obligatoria, sin mostrar
  el valor.
- [ ] Definir backups: base, adjuntos, volúmenes Docker, configuración de
  Nginx, unidades systemd, definiciones PM2 e imágenes/digests necesarios
  para rollback.
- [ ] Probar restauración aislada trimestralmente y medir RTO/RPO reales.
- [ ] Definir y probar procedimiento de rotación por tipo de secreto. La
  rotación requiere autorización y plan de compatibilidad; no realizarla como
  efecto colateral de este roadmap.

### Criterio de terminado

- Un host nuevo puede configurarse desde documentación y secretos autorizados,
  sin copiar valores desde chats, historial de terminal ni imágenes.
- Se superó una restauración aislada para cada tipo de dato crítico.

## 13. Fase 7 — Contenerización gradual de backends (decisión posterior)

Objetivo: evaluar si Docker debe convertirse en el runtime común de backends,
sin asumirlo como requisito para estandarizar releases.

### Puerta de decisión obligatoria

No iniciar esta fase hasta que estén completas las fases 0 a 6 y exista una
decisión escrita que compare mantener PM2 contra contenerizar. La decisión
debe incluir costo operativo, competencias, red, firewall, backup, logs,
rollback y monitoreo.

### Orden recomendado si se aprueba

1. Core como piloto, porque ya tiene una preparación Docker documentada.
2. Resolver antes el bind address y red bridge; no promover a producción un
   contenedor con `network_mode: host` que escuche accidentalmente en todas
   las interfaces.
3. Ejecutar PM2 y contenedor en paralelo en puerto alterno, con pruebas de
   contrato y health.
4. Cortar una sola ruta/puerto tras autorización, conservar PM2 detenido pero
   disponible como rollback durante la ventana de observación.
5. Continuar con Obs, Activos, RH, Legal, SAP y Mantenimiento uno por uno.
6. Monitor/Agent se evalúan aparte: es Go/systemd y tiene restricciones de
   endpoint; no se fuerza a Docker sólo por simetría.

### Tareas comunes por backend candidato

- [ ] Dockerfile multi-stage, usuario no-root, lockfile y `.dockerignore`.
- [ ] Healthcheck real y cierre limpio por SIGTERM.
- [ ] Imagen etiquetada por commit y digest, SBOM y análisis de seguridad.
- [ ] Red explícita, sin puertos públicos no justificados.
- [ ] Variables y secretos inyectados en runtime.
- [ ] Ensayo contra puerto alterno con 200/401/403/503 y contratos propios.
- [ ] Smoke por Nginx tras promoción y rollback ensayado al runtime anterior.
- [ ] Actualización de `services.json`, runbook y bitácora de este documento.

### Criterio de terminado

- Cada corte tiene evidencia de compatibilidad y rollback probado.
- No se retira PM2/systemd hasta que transcurra el periodo de observación y
  exista autorización explícita.

## 14. Fase 8 — Operación empresarial y ejercicios de recuperación

Objetivo: que la plataforma siga siendo mantenible al crecer el número de
usuarios y personas operadoras.

### Tareas

- [ ] Crear runbooks de: publicar frontend, publicar backend, rollback,
  incidente de disponibilidad, incidente de autenticación, restauración,
  saturación de disco, certificado vencido y caída de proveedor externo.
- [ ] Establecer revisión de cambios: qué requiere dos personas, qué puede
  automatizarse y qué requiere ventana de mantenimiento.
- [ ] Ejecutar cada trimestre un game day no destructivo: rollback de
  frontend, restauración aislada, caída simulada de dependencia y validación
  de alertas.
- [ ] Medir y actualizar RTO/RPO a partir de ejercicios, no de estimaciones.
- [ ] Revisar mensualmente vulnerabilidades, dependencias, expiración de
  certificados, retención de logs/imágenes/backups y cuentas con acceso de
  despliegue.
- [ ] Capacitar al menos a dos personas en el procedimiento de publicación y
  recuperación de cada familia de runtime.

### Criterio de terminado

- La operación no depende de una sola persona ni de conocimiento en un chat.
- El último game day cumple los SLO acordados y genera acciones de mejora.

## 15. Checklist de promoción por cambio

Copiar este checklist a cada cambio productivo:

```markdown
## Promoción: <módulo> / <release-id>

- [ ] Alcance y responsable confirmados.
- [ ] `git status --short` limpio y commit: `<hash>`.
- [ ] Pruebas/lint/typecheck/build aprobados: `<enlace o evidencia>`.
- [ ] Artefacto inmutable creado: `<ruta o digest>`.
- [ ] Release anterior identificado: `<id o digest>`.
- [ ] Backup y rollback disponibles.
- [ ] Ventana y canal de observación confirmados.
- [ ] Promote ejecutado por: `<persona>`, fecha/hora: `<ISO-8601>`.
- [ ] Smoke de URL pública 200 y asset principal 200.
- [ ] Prueba de autorización esperada (401/403) aprobada.
- [ ] Health API aprobado.
- [ ] Observación completada: `<periodo, 5xx, logs, alertas>`.
- [ ] Bitácora actualizada.
```

## 16. Bitácora de avance

Agregar una fila sólo cuando un hito tenga evidencia. No sustituye los commits
ni los registros de cambio de operación.

| Fecha | Fase/hito | Estado | Repositorios | Commits/artefactos | Evidencia | Rollback comprobado | Decisión o bloqueo |
|---|---|---|---|---|---|---|---|
| 2026-10-14 | Creación de esta hoja de ruta | `[x]` | MRTI | pendiente de commit | Revisión de `SERVICE_BOUNDARIES`, Platform y estado de repositorios | No aplica | No ejecuta despliegues ni altera runtimes |
| 2026-10-14 | Fase 1: contrato común y observabilidad de versión | `[-]` | MRTI, MRTI-Platform | pendiente de commit | `npm test` de Platform: 35/35; `node bin/health.mjs --json`: saludable y versiones/digest expuestos | Prueba existente de smoke fallido restaura release anterior; no se promovió nada | Falta revisión y aprobación explícita de Administración de Plataforma antes de cerrar la fase |
| 2026-10-14 | Fase 0: línea base operativa | `[-]` | MRTI, MRTI-Platform | pendiente de commit | Health 10/10; inventario saneado, HEAD/estado de 11 repos y runtimes en `MRTI-Platform/docs/phase0-baseline/2026-10-14-delivery-baseline.md` | No aplica; sólo lectura | Requiere responsables, SLO/RTO/RPO, evidencia privada y ensayo de restauración; `sync --check` detectó 31 copias desalineadas |
| 2026-10-14 | Fase 2: releaser estático, endurecimiento inicial | `[-]` | MRTI, MRTI-Platform | pendiente de commit | `npm test` de Platform: 36/36; preflight rechaza fuente sucia antes de crear artefacto | Simulado: ciclo de release y smoke fallido restauran el anterior | No sincronizado a módulos: hay 31 copias desalineadas que deben revisarse antes de escribirlas |
| 2026-10-14 | Fase 3: piloto de validación continua | `[-]` | MRTI-Platform, MRTI | pendiente de commit | Workflow de sólo lectura para Node 20, instalación bloqueada, pruebas y `git diff --check`; documentación de límites | No aplica: no publica ni se ha activado por push | Falta aprobación del ejecutor y extender validación específica a cada módulo |
| 2026-10-14 | Fase 4: preparación de frontend inmutable de Tickets | `[-]` | MRTI-Tickets, MRTI | pendiente de commit | Compose por digest valida; pruebas frontend 4/4 y build local aprobados | No aplica: no se ejecutó `compose up` ni se cambió contenedor | Falta registro OCI privado, adaptador completo, ensayo aislado y promoción/rollback autorizados |
| 2026-10-14 | Fase 5: línea base de observabilidad | `[-]` | MRTI-Platform, MRTI | pendiente de commit | Health 10/10; ocho APIs repiten Request ID, Tickets y Monitor no; health JSON reporta el estado de propagación | No aplica: auditoría de sólo lectura | Faltan Nginx/logs, Tickets/Monitor, alertas, retención y cuenta técnica de smoke |

## 17. Definición final de terminado

Este programa estará terminado únicamente cuando:

- Todos los módulos implementen el contrato de release de la sección 3.
- Ninguna promoción normal parta de un árbol Git sucio.
- Todo artefacto publicado sea identificable por commit y checksum/digest.
- Todos los módulos tengan health, smoke publicado y rollback ensayado.
- Tickets use imágenes inmutables con digest y no build contextual directo en
  producción.
- Observabilidad, alertas, rotación de logs, backup y restauración aislada
  estén probados y documentados.
- Cualquier contenerización de backend aprobada conserve puertos, rutas,
  UUID, contratos y rollback compatibles durante la transición.
- Dos o más personas puedan publicar y recuperar cada módulo siguiendo los
  runbooks, sin depender de conocimiento informal.
