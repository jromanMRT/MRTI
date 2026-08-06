# Fase 0 — Línea base y contratos (2026-08-06)

Evidencia recolectada según el checklist de la Fase 0 de
`CORE_INFRA_MIGRATION_GUIDE.md`. Todo lo aquí documentado es de solo lectura;
no se modificó ningún dato real.

## 1. Estado de los repositorios antes de tocar nada

| Repo | Rama | Estado | Nota |
|---|---|---|---|
| MRTI | main (ahead 4 de origin) | `src/main.js` modificado (lazy-render del Centro de control, ajeno a esta migración) | Preservado sin tocar |
| MRTI-Infra | main (ahead 1) | limpio | — |
| MRTI-Activos | main | limpio | — |
| MRTI-RH | master | limpio | — |
| MRTI-Tickets | main | limpio | — |
| MRTI-Agent | main | limpio | — |

## 2. Inventario de rutas `/api/auth/*` (montadas en `MRTI-Infra/server/src/auth.js`)

| Método | Ruta | Middleware | Códigos observados |
|---|---|---|---|
| GET | `/registration-status` | ninguno | 200 |
| POST | `/register` | `registerLimiter` | 400, 403 (cerrado: solo permite el primer usuario), 409, 201 |
| POST | `/login` | `loginLimiter` | 400, 401, 403 (cuenta inactiva), 200 |
| GET | `/me` | `authRequired` | 401, 200 |
| PATCH | `/profile` | `authRequired` | 401, 200 |
| PATCH | `/profile/password` | `authRequired` | 401, 200 |
| POST | `/users` | `authRequired` (sin `administratorOnly` explícito en la firma; revisar en Fase 1) | 401, 200/201 |
| GET | `/assignees` | `authRequired` | 401, 200 |
| GET | `/users` | `authRequired` | 401, 200 |
| PATCH | `/users/:id` | `authRequired` | 401, 200 |
| GET | `/access-control` | `authRequired` + `administratorOnly` | 401, 403, 200 |
| PATCH | `/users/:id/location` | `authRequired` + `administratorOnly` | 401, 403, 400, 404, 409, 200 |
| GET | `/module-access/:moduleCode` | `authRequired` | 401, 404 (módulo desconocido), 403 (`MODULE_FORBIDDEN`), 204 |
| POST | `/access-areas` | `authRequired` + `administratorOnly` | 401, 403, 200/201 |
| PATCH | `/access-areas/:id` | `authRequired` + `administratorOnly` | 401, 403, 200 |
| PATCH | `/users/:id/access-area` | `authRequired` + `administratorOnly` | 401, 403, 200 |
| GET | `/ticket-context` | `authRequired` | 401, 200 |

`authRequired` (en `shared.js`): sin header → 401; JWT inválido/expirado → 401;
usuario inactivo → 401. `signToken` usa HS256 simétrico (`JWT_SECRET`), TTL
`JWT_EXPIRES_IN` (8h en producción). `findProfile` calcula `allowed_modules`
(todos los códigos si `role === 'administrator'`, si no según
`access_area_modules` del área asignada).

## 3. Matriz de consumidores reales (por código, no solo por tráfico — ver §6)

| Consumidor | Endpoint(s) usados | Variable de entorno | Manejo de error |
|---|---|---|---|
| MRTI (portal, `src/main.js`) | `/login`, `/me`, `/profile/password`, `/access-control`, `/users*`, `/access-areas*` | ninguna (mismo origen vía Nginx) | Muestra `error.message` de la respuesta |
| MRTI-Activos (`server/src/auth.js`) | `/module-access/activos` | `MRTI_INFRA_URL` (default `http://127.0.0.1:3002`) | 204→next, 401→401, 403→403, cualquier otro→503 |
| MRTI-RH (`server/src/auth.js`) | `/module-access/rh`, `/me` | `MRTI_INFRA_URL` | mismo patrón que Activos; `/me` es best-effort (null en error) |
| MRTI-Tickets (`backend/src/integrations/coreClient.ts`) | `/me` (vía `AUTH_PROFILE_URL`), `/assignees` (vía `AUTH_ASSIGNEES_URL`), `/ticket-context` (derivado de `AUTH_PROFILE_URL` o `AUTH_TICKET_CONTEXT_URL`) | `AUTH_PROFILE_URL`, `AUTH_ASSIGNEES_URL`, `CORE_INTROSPECT_URL`, `JWT_PUBLIC_KEY` (fallback no usado hoy: el JWT actual es HS256, no hay clave pública) | catch → `{active:false}` / `null` |
| MRTI-Agent Core (`cmd/mrti-core/main.go`) | `/module-access/agent-core` | hardcodeado `http://127.0.0.1:3002/...` (no usa `MRTI_INFRA_URL`) | — |

Nota: Tickets usa un nombre de variable distinto (`AUTH_PROFILE_URL`) al patrón
`MRTI_INFRA_URL` de Activos/RH — dos convenciones de configuración para el
mismo backend. Unificar esto es parte natural de la Fase 4.

## 4. Puertos, procesos y Nginx

| Proceso | Gestor | Puerto | Nombre |
|---|---|---|---|
| MRTI-Infra API (dueño actual de `/api/auth`) | pm2 | 3002 | `mrti-infra-api` |
| MRTI-Activos API | pm2 | 3003 | `mrti-activos-api` |
| MRTI-RH API | pm2 | 3004 | `mrti-rh-api` |
| Proyecto ajeno a MRTI (`/var/www/mrt/MonitorieoMRT-Web`) | pm2 | — | `monitoreo-mrt` — no forma parte de esta plataforma, no se tocó |
| MRTI-Agent Core (telemetría, **no relacionado con la identidad**) | systemd | 8477 (ver README del Agent) | `mrti-core.service` — **activo** |
| MRTI-Agent (agente de monitoreo) | systemd | — | `mrti-agent.service` — en `activating auto-restart` (crash-loop; ajeno a esta migración, no se tocó) |
| MRTI-Tickets backend/frontend | docker-compose propio | — | **no encontrado corriendo**; el `docker ps` del host solo mostró una pila `ti-platform-*` (incluye Keycloak) ajena a MRTI-Tickets — no se tocó |

Nginx (`/etc/nginx/sites-available/it-infra`, root `MRTI/dist`): hoy **no
existe** un `location /api/auth/` propio; todo `/api/` (incluida
`/api/auth/*`) se resuelve en un solo bloque `location /api/` apuntando al
proceso de Infra. La Fase 2 requiere añadir un bloque `/api/auth/` más
específico *antes* del genérico `/api/` para poder cambiar su upstream sin
mover el resto de las rutas operativas de Infra.

## 5. Riesgo nuevo encontrado: colisión de nombre "MRTI Core"

**MRTI-Agent ya tiene un binario y servicio llamado `mrti-core`** (README:
"mrti-core — a self-hostable reference Core server" para telemetría, con
dashboard y REST API en el puerto 8477). Ese servicio está **corriendo
activamente ahora mismo** como `mrti-core.service`. El plan de migración
(`CLAUDE_MASTER_PROMPT.md` / `CORE_INFRA_MIGRATION_GUIDE.md`) usa el mismo
nombre, "MRTI Core", para el **nuevo backend de identidad** que la Fase 1
crearía en `MRTI/server/`.

Esto no es solo cosmético: dentro de poco habrá dos procesos, dos posibles
nombres de servicio PM2/systemd, dos bases de código, y una palabra ("Core")
que en una conversación de operación ("reinicia Core", "Core está caído")
podría referirse a cualquiera de los dos. Antes de crear el backend de la
Fase 1 hace falta decidir uno de:

- Nombrar al nuevo backend de identidad distinto de "Core" (p. ej. "MRTI
  Auth", "MRTI Identity"), dejando "MRTI Core" para el servidor de telemetría
  del Agent que ya lo usa en producción.
- Renombrar el servidor de telemetría del Agent (rompe menos superficie
  pública porque hoy solo es un binario/servicio interno, pero toca el
  README, `cmd/mrti-core`, el paquete de Windows y el servicio systemd ya
  desplegado).

No se tomó ninguna decisión aquí — se deja registrada como bloqueo de negocio
para antes de iniciar la Fase 1 (regla del protocolo: detenerse ante una
decisión de negocio no definida).

## 6. Tráfico real medido en Nginx

El log de acceso disponible (`/var/log/nginx/access.log`) solo cubre
`2026-08-06 08:03` a `13:01` (rotación reciente, 1731 líneas totales) y no
tiene ninguna petición a `/api/auth/*` en esa ventana — consistente con que
hoy solo hay 3 usuarios reales y poca actividad. La matriz de consumidores de
la sección 3 se basa en el código (`rg`), no en tráfico observado. Si se
quiere confirmar empíricamente qué consume qué, hay que repetir esta medición
tras un periodo de uso más largo, o revisar `/var/log/nginx/access.log.1`
cuando exista.

## 7. Pruebas de contrato añadidas

`MRTI-Infra/server/test/auth-contract.test.js` (Node test runner nativo,
`npm test` dentro de `server/`). Corre contra el proceso real de pm2
(`mrti-infra-api`, puerto de `.env`), usando dos usuarios fixture desechables
(`phase0-viewer-*@contract.test`, `phase0-admin-*@contract.test`,
contraseña de prueba fija, nunca credenciales reales) insertados antes de las
pruebas y borrados al final.

Resultado ejecutado el 2026-08-06:

```
$ npm test
# tests 9
# pass 9
# fail 0
```

Cobertura de códigos: 200 (`/me`, `/access-control` como admin), 204
(`/module-access/:code` como admin), 401 (`/login` credenciales inválidas,
`/me` sin token, `/me` con token alterado), 403 (`/module-access/:code` sin
módulo asignado, `/access-control` sin ser admin), 404
(`/module-access/no-existe`).

Verificado tras correr las pruebas: `user_profiles` sigue en 3 filas (ningún
residuo de los fixtures).

## 8. Respaldo de esquema y conteos

- `phase0-baseline/mrti_infra_identity_schema.sql` — `mysqldump --no-data`
  (solo estructura, sin filas ni hashes de contraseña) de `user_profiles`,
  `access_areas`, `access_area_modules`, `areas`, `floors`, `buildings`,
  `sites`, `devices`.
- `phase0-baseline/table-counts-2026-08-06.txt` — conteos de fila el
  2026-08-06: `user_profiles`=3, `access_areas`=2, `access_area_modules`=3,
  `areas`=0, `devices`=24.

## 9. Hallazgo menor (no bloqueante)

`MRTI-Infra/server/src/config/security.js` exporta
`PUBLIC_REGISTRATION_ENABLED` a partir de `ALLOW_PUBLIC_REGISTRATION`, pero
ningún archivo lo importa: `POST /register` decide por sí solo (cerrado en
cuanto `user_profiles` tiene una fila) sin leer esa bandera. Es config muerta,
ajena al alcance de esta migración; no se tocó.

## Criterio de terminado de la Fase 0

- [x] Rutas `/api/auth/*` inventariadas.
- [x] Formato de login/`/me`/`module-access`/errores documentado.
- [x] Pruebas de contrato 200/204/401/403/404 añadidas y pasando contra Infra.
- [x] Puertos, PM2, Nginx y variables de entorno registrados sin secretos.
- [x] Esquema y conteos de tablas de identidad respaldados.
- [x] Tráfico medido (con la limitación de ventana de log corta, documentada).

Fase 0 completa. Bloqueo abierto antes de Fase 1: decidir el nombre del nuevo
backend de identidad (sección 5).
