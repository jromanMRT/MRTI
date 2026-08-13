# Contenerización de MRTI Core API — preparación y corte futuro

Estado: **preparación completa, corte NO ejecutado.**
Fecha: 2026-08-13
Repositorio: `MRTI` (`server/`)
Relacionado con: `CORE_INFRA_MIGRATION_GUIDE.md` (fuente de verdad de propiedad
de datos, compatibilidad y rollback). Este documento cubre exclusivamente el
**vehículo de despliegue** de Core (PM2 → Docker), no cambia propietarios de
datos, contratos ni bases.

Alcance de esta iniciativa: contenedor por proceso desplegable, empezando
por `core-api`. No se toca todavía MRTI-Obs, Activos, RH, Tickets, Monitor,
Nginx ni MySQL — todos siguen exactamente como están.

## Archivos creados en esta fase

- `server/Dockerfile` — imagen de producción, dos etapas (`deps`/`runtime`),
  `node:20-alpine`, usuario no-root, `npm ci --omit=dev`, healthcheck contra
  `/api/health`, `CMD` en forma exec (sin shell) para recibir señales
  directamente como PID 1.
- `server/.dockerignore` — excluye `node_modules`, `.env*` (conserva
  `.env.docker.example`), `test/`, `docs/`, `.git`, archivos de compose.
- `server/.env.docker.example` — plantilla versionada, sin valores reales.
  Sin literales `changeme`: los campos sensibles quedan vacíos a propósito
  para que el proceso falle de forma explícita si no se llenan.
- `docker-compose.core.yml` (raíz de `MRTI/`) — servicio único `core-api`,
  compose de **transición**, pensado para correr como contenedor de prueba
  en paralelo a PM2, no para el corte real tal cual está.
- `.gitignore` actualizado: ignora `server/.env.docker`, conserva
  `.env.docker.example`.

## Archivo NO versionado (no commitear)

- `server/.env.docker` — copia de los valores reales de `server/.env` con
  ajustes de red para el contenedor de prueba. Generado localmente en esta
  sesión, permisos `600`, excluido por `.gitignore`. Contiene los mismos
  secretos que `server/.env` (JWT, credenciales MySQL) — tratarlo con el
  mismo cuidado.

## Decisión de red: `network_mode: host` (temporal, documentada)

Se intentó primero bridge + `host.docker.internal` (`extra_hosts:
host-gateway`) publicando solo en `127.0.0.1`. Se descartó porque MySQL en
este host tiene `bind-address = 127.0.0.1` — correcto, y fuera de alcance
tocarlo — y un contenedor en bridge llega al host por la IP del gateway
(ej. `172.17.0.1`), no por `127.0.0.1`, así que nunca alcanzaba MySQL. La
única forma de que el contenedor viera `127.0.0.1:3306`/`:3002`/`:3003`
exactamente igual que PM2, sin tocar MySQL, es compartir el namespace de red
del host.

**Limitación real, verificada en esta sesión:** con `network_mode: host`,
`ports:` no aplica, y `src/index.js` hace `app.listen(PORT, cb)` sin bind
address explícito (`0.0.0.0`) — el puerto de prueba (3105) queda expuesto en
todas las interfaces del host mientras el contenedor esté arriba, no solo en
loopback. No fue posible confirmar reglas de firewall del host en esta
sesión (requiere root). Mitigación aplicada: el contenedor solo se levantó
durante la verificación activa y se detuvo inmediatamente después.

Mejora recomendada, fuera de alcance de esta sesión: añadir soporte de
`HOST` en `src/index.js` (`app.listen(PORT, HOST, cb)`) para poder acotar a
`127.0.0.1` incluso en host networking, o migrar a una red bridge nombrada
cuando MRTI-Obs/Activos también se contenericen (en ese punto ya no haría
falta tocar `127.0.0.1` del host — todo el tráfico sería contenedor a
contenedor por nombre de servicio).

## Comandos para construir y probar (contenedor de prueba, puerto 3105)

```bash
cd /var/www/mrt/MRTI/MRTI

# 1. Preparar el env real de prueba (una sola vez, no versionado):
cp server/.env server/.env.docker
# Editar server/.env.docker: PORT=3105, NODE_ENV=production
# (MYSQL_HOST/MRTI_OBS_URL/MRTI_ASSETS_URL ya son 127.0.0.1, no tocar)

# 2. Construir
docker compose -f docker-compose.core.yml build

# 3. Levantar (comparte red del host, ver limitación de red arriba)
docker compose -f docker-compose.core.yml up -d

# 4. Verificar
curl -s http://127.0.0.1:3105/api/health
CONTRACT_TEST_URL=http://127.0.0.1:3105 npm --prefix server test

# 5. Apagar SIEMPRE al terminar de probar (no dejar corriendo sin supervisión)
docker compose -f docker-compose.core.yml down
```

## Resultados de verificación de esta sesión

| Verificación | Resultado |
|---|---|
| `docker compose -f docker-compose.core.yml build` | OK, 0 vulnerabilidades (`npm ci --omit=dev`) |
| Contenedor arranca y healthcheck | `healthy`, `GET /api/health` → `200 {"ok":true,"database":"mysql"}` |
| `GET /api/auth/me` sin token | `401 {"error":"No autenticado"}` |
| `GET /api/auth/me` con token inválido | `401 {"error":"Sesión inválida o expirada"}` |
| `GET /api/portal/v1/applications` sin token | `401` |
| Pruebas de contrato (`auth-contract.test.js` + `portal-contract.test.js`) | **17/17 OK** contra el contenedor (puerto 3105) |
| Fixtures residuales tras las pruebas | 0 (`DELETE` en `after()` confirmado por consulta directa) |
| `SIGTERM` (`docker stop`) | Contenedor terminó en <1s, `ExitCode 143` (SIGTERM limpio, no requirió `SIGKILL` al timeout de 10s) |
| `docker compose config --quiet` | Sintaxis válida |
| `git diff --check` | Sin errores |
| Secretos en la imagen | Ninguno — `find / -iname '.env*'` dentro del contenedor: vacío |
| Secretos en archivos versionados nuevos | Ninguno — solo placeholders vacíos en `.env.docker.example` |
| PM2 `mrti-core-api` (producción, puerto 3005) | Sin interrupción, `online`, health `200` antes/durante/después |
| Nginx | No modificado (`md5sum` de `it-infra` sin cambios) |

**Incidente registrado:** `docker compose config` (sin `--quiet`) imprimió en
la salida de esta sesión las variables de entorno ya interpoladas, incluyendo
`JWT_SECRET` y `MYSQL_PASSWORD` en texto plano. No quedaron en ningún
archivo del repo ni en la imagen — solo en el transcript de esta
conversación. Se corrigió de inmediato usando `docker compose config
--quiet` en adelante. Recomendación: evaluar rotación de `JWT_SECRET` y de
la contraseña de `mrtops` en MySQL como precaución; **no se rotó nada en
esta sesión** (requiere autorización explícita, igual que cualquier rotación
de secretos según `AGENTS.md`).

## Procedimiento exacto para el corte futuro (PM2 → Docker)

**No ejecutar sin autorización explícita.** Orden recomendado:

1. Congelar cambios en `MRTI/server` (sin despliegues pendientes).
2. `docker compose -f docker-compose.core.yml build` con el código a
   desplegar.
3. Levantar el contenedor en el puerto de prueba (3105) una vez más y repetir
   la tabla de verificación de arriba contra el código final.
4. Editar `docker-compose.core.yml`:
   - Cambiar `PORT` en `.env.docker` (o crear `server/.env` de producción
     dedicado) a `3005`.
   - Decidir en ese momento si se mantiene `network_mode: host` o se migra a
     bridge — para entonces, si Obs/Activos siguen sin contenerizar, la
     limitación de exposición 0.0.0.0 documentada arriba sigue aplicando y
     debe aceptarse explícitamente o resolverse (bind address) antes del
     corte real.
5. Detener PM2: `pm2 stop mrti-core-api` (no `delete` todavía — conservarlo
   como rollback inmediato).
6. Levantar el contenedor en el puerto real: `docker compose -f
   docker-compose.core.yml up -d`.
7. Ejecutar los smoke tests post-corte (sección siguiente).
8. Si todo pasa, `pm2 delete mrti-core-api` y `pm2 save` solo después de un
   período de observación (criterio igual al de las fases del
   `CORE_INFRA_MIGRATION_GUIDE.md`: sin incremento de 5xx/401 inesperados).
9. Actualizar `CORE_INFRA_MIGRATION_GUIDE.md` (secciones 9 y 10) con fecha,
   hash de commit y evidencia, siguiendo su protocolo §7.

Nginx no requiere cambios en este corte: sigue apuntando a
`127.0.0.1:3005`, sin importar si ese puerto lo sirve PM2 o Docker.

## Smoke tests post-corte

- `curl http://127.0.0.1:3005/api/health` → `200`.
- Login real con una cuenta de prueba desechable → `200` + token.
- `GET /api/auth/me` con ese token → `200`, mismo `profile.id` que antes del
  corte.
- `GET /api/auth/module-access/<código real>` → `204`/`403` según
  corresponda.
- `GET /api/portal/v1/applications` con token real → `200`, mismo catálogo.
- Confirmar que RH, Activos, Tickets y Agent (que llaman a Core vía
  `MRTI_CORE_URL=http://127.0.0.1:3005`) siguen autenticando sin cambios —
  no requieren saber si el puerto lo sirve PM2 o Docker.
- Revisar `docker logs core-api` y el `error.log` de Nginx unos minutos
  después del corte, buscando 5xx o excepciones no manejadas.

## Rollback inmediato a PM2

```bash
docker compose -f docker-compose.core.yml down
pm2 restart mrti-core-api   # si se hizo "pm2 stop" y no "pm2 delete"
curl http://127.0.0.1:3005/api/health
```

Si ya se hizo `pm2 delete`, reconstituir con
`pm2 start MRTI/ecosystem.config.cjs --only mrti-core-api && pm2 save`.
Ninguna migración de base ni cambio de esquema está involucrada en este
corte — el rollback no tiene componente de datos, solo de proceso.

## Riesgos pendientes (no resueltos en esta sesión)

1. **Exposición 0.0.0.0 con `network_mode: host`:** el proceso no soporta
   bind address configurable; en host networking escucha en todas las
   interfaces. Mitigado en pruebas apagando el contenedor entre usos; para
   el corte real conviene resolverlo (código o firewall) antes, no después.
2. **No se pudo verificar el firewall del host** en esta sesión (requiere
   root) para dimensionar el riesgo real del punto anterior.
3. **`JWT_SECRET`/contraseña MySQL de `mrtops` quedaron en el transcript**
   de esta sesión por el incidente de `docker compose config` sin
   `--quiet`. Pendiente decisión de rotación (fuera de alcance de esta
   sesión, requiere autorización).
4. Cuando se contenericen Obs/Activos, este compose debe migrar de
   `network_mode: host`/`127.0.0.1` a una red bridge nombrada con
   resolución por nombre de servicio — pendiente, no antes de esa fase.
5. El healthcheck de Core solo valida MySQL, no Obs/Activos — coherente con
   la decisión de la guía (§10, 2026-08-10) de que Core Fase 1 es
   deliberadamente un espejo mínimo de identidad, pero significa que un
   `docker compose ps` "healthy" no garantiza que `/api/self/*` funcione.

## Aclaración explícita

**El corte real de PM2 a Docker NO se ejecutó en esta sesión.** Producción
sigue siendo atendida exclusivamente por `pm2` (`mrti-core-api`, puerto
3005). Todo lo construido aquí es un contenedor de prueba, verificado y
detenido, en un puerto alterno (3105). El puerto 3005 nunca fue publicado
por Docker.
