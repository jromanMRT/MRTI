# Guía operativa de evolución MRTI Core / MRTI-Obs (antes MRTI Infra)

Estado de la guía: activa  
Fecha base: 2026-08-06  
Workspace: `/var/www/mrt/MRTI`

## 1. Objetivo

Evolucionar la plataforma hasta que cada módulo tenga una responsabilidad
inequívoca, sin interrumpir autenticación, permisos, autoservicio, monitoreo ni
operación administrativa.

El resultado deseado es:

- **MRTI Core** es propietario de identidad, sesiones, usuarios, permisos,
  catálogo de módulos y experiencia personal del trabajador.
- **MRTI-Obs** administra infraestructura técnica, topología, monitoreo,
  disponibilidad, mapas y alertas.
- **MRTI Activos** administra el ciclo de vida patrimonial y operativo de los
  activos, asignaciones, garantías, mantenimiento y licencias.
- **MRTI RH** administra la ficha laboral, organización, ausencias y expediente.
- **MRTI Tickets** administra solicitudes de servicio, SLA y seguimiento.
- **MRTI Agent** recolecta telemetría y ejecuta funciones autorizadas en equipos;
  no es propietario de usuarios ni de inventario patrimonial.
- **MRTI Legal** administra expedientes legales, documentación jurídica
  confidencial, versiones, permisos por expediente, retención y bloqueos
  legales.

La migración está terminada cuando MRTI-Obs ya no contiene autenticación ni control
de acceso, no existen dos módulos editando el mismo dato maestro y todos los
consumidores usan contratos versionados con pruebas.

## 2. Principios no negociables

1. **Un propietario por dato.** Un módulo escribe el dato maestro; los demás
   consultan su API o conservan únicamente el identificador externo.
2. **Compatibilidad antes que limpieza.** No se elimina una ruta, columna o tabla
   hasta demostrar que no recibe tráfico y que existe rollback.
3. **Migración incremental.** Cada fase debe poder desplegarse y revertirse de
   forma independiente.
4. **Identidad controlada por servidor.** El navegador nunca decide qué usuario,
   empleado o propietario representa la sesión.
5. **UUID estable.** `user_profiles.id` conserva sus valores actuales durante y
   después de la extracción.
6. **Sin llaves foráneas entre módulos.** Las referencias cruzadas son UUID/ID
   estables validados por API o procesos de conciliación.
7. **APIs de autoservicio separadas.** Un usuario autenticado puede consultar
   sus propios datos y crear gestiones propias expresamente permitidas sin
   recibir permisos administrativos ni acceso operativo al módulo.
8. **Sin migraciones destructivas tempranas.** Primero expandir, luego copiar o
   enrutar, verificar y finalmente retirar.
9. **Observabilidad obligatoria.** Cada corte de tráfico debe dejar health check,
   logs y una forma de medir errores por ruta.
10. **Nómina permanece fuera de alcance** mientras no exista una decisión formal
    sobre seguridad, cumplimiento y propietario del dominio.

## 3. Matriz de propiedad objetivo

| Dominio o dato | Propietario | Consumidores | Regla |
|---|---|---|---|
| Usuarios, correo de acceso, contraseña, sesión y JWT | Core | Todos | Solo Core autentica y emite tokens |
| Roles, áreas de acceso y módulos permitidos | Core | Todos | Los módulos validan permisos contra Core |
| Dashboard personal y composición de widgets | Core | Trabajadores | Core compone; no duplica datos maestros |
| Ficha laboral y `portal_user_id` | RH | Core | RH enlaza empleado con UUID de Core |
| Departamentos y jefe laboral | RH | Core, Tickets | No confundir con ubicación física |
| Sitios, edificios, pisos, áreas físicas y planos | MRTI-Obs | Core, RH, Activos | MRTI-Obs es dueño de la topología |
| Monitores, estado de red, disponibilidad y alertas | MRTI-Obs | Core, Agent | MRTI-Obs almacena estado operacional |
| Telemetría cruda y ejecución en endpoint | Agent | MRTI-Obs | MRTI-Obs consume eventos; Agent no asigna activos |
| Activo, serie, compra, garantía y mantenimiento | Activos | MRTI-Obs, Core, RH | Activos es el inventario maestro |
| Asignación patrimonial persona-activo | Activos | Core, RH, Tickets | Referencia `user_id` de Core |
| Ticket, SLA, comentarios y estado | Tickets | Core, módulos | Core solo muestra el resumen personal |
| Vacaciones, permisos, saldos y expediente | RH | Core | Core usa `/rh-self`; RH conserva administración |
| Expediente legal, documentos, versiones, permisos por expediente, retención, bloqueo legal | Legal | Core | Legal usa `/legal-self` para notificaciones; sin FK hacia otras bases |

### Diferencias que deben respetarse

- Un **departamento laboral** pertenece a RH.
- Un **área física** pertenece a MRTI-Obs.
- Un **activo patrimonial** pertenece a Activos.
- Un **dispositivo monitoreado** pertenece a MRTI-Obs y referencia, cuando aplique,
  el activo patrimonial mediante un identificador estable.
- El **equipo habitual del usuario** debe derivarse de una asignación en Activos;
  Core puede mostrarlo, pero no debe mantener una segunda asignación maestra.

## 4. Estado inicial conocido

### Core

- El frontend está en `MRTI/src/main.js`.
- Ya existe dashboard personal que consume `/rh-api/api/rh-self/*`.
- Las tarjetas de aplicaciones se filtran con `profile.allowed_modules`.
- Aún no existe un backend propio del Core.

### Infra

- Es propietario temporal de autenticación y control de acceso.
- Código principal de identidad:
  - `MRTI-Infra/server/src/auth/shared.js`
  - `MRTI-Infra/server/src/auth/accessControlRoutes.js`
  - rutas bajo `/api/auth/*`
- Tablas que deben migrar a Core:
  - `user_profiles`
  - `access_areas`
  - `access_area_modules`
- `findProfile` también mezcla ubicación física con identidad.
- Infra conserva sitios, edificios, pisos, áreas, dispositivos y monitoreo.

### RH

- Valida acceso administrativo contra `module-access/rh`.
- El autoservicio `/api/rh-self` valida solo la sesión y fuerza la identidad.
- `employees.portal_user_id` referencia lógicamente el UUID de Core.

### Riesgos actuales

- Extraer `/api/auth` sin una ruta compatible cerraría sesiones en todos los
  módulos.
- Mover tablas y proceso al mismo tiempo dificulta rollback.
- Infra y Activos pueden duplicar asignaciones y atributos de dispositivos.
- Cambiar el secreto JWT durante la extracción invalidaría todas las sesiones.
- **Colisión de nombre "MRTI Core" — resuelta 2026-08-06:** se decidió
  renombrar el servidor de telemetría de `MRTI-Agent` a "MRTI Monitor"
  (`MRTI-Agent@8cb2064`), dejando "MRTI Core" libre para el backend de
  identidad de la Fase 1. Ver `docs/architecture/phase0-baseline/BASELINE.md
  §5` y el registro de decisiones (§10). **Pendiente:** el host de producción
  sigue corriendo el `mrti-core.service`/binario viejo; el corte en vivo no
  se ha hecho y requiere autorización explícita antes de tocar el servicio
  real.

## 5. Arquitectura de transición

La extracción se divide en dos cortes diferentes:

1. **Propiedad del proceso:** crear el backend de Core y mover allí el código de
   autenticación, inicialmente leyendo las tablas actuales.
2. **Propiedad de los datos:** mover las tablas de identidad a `mrti_core` solo
   cuando el proceso nuevo sea estable.

Durante la transición:

- La ruta pública `/api/auth/*` se conserva.
- Nginx cambia únicamente el upstream de `/api/auth/` al backend de Core.
- Infra conserva `/api/` para sus rutas operativas.
- `MRTI_INFRA_URL` continúa aceptándose temporalmente; se introduce
  `MRTI_CORE_URL` y se registra advertencia cuando se usa el nombre antiguo.
- Se conserva el mismo `JWT_SECRET`, algoritmo y estructura de claims hasta que
  todos los módulos validen contra Core.

## 6. Fases de ejecución

### Fase 0 — Línea base y contratos

Objetivo: conocer consumidores y congelar el comportamiento que no puede romperse.

Checklist:

- [ ] Inventariar todas las rutas `/api/auth/*` y sus consumidores con `rg`.
- [ ] Documentar formato de login, `/me`, `module-access/:code` y errores.
- [ ] Añadir pruebas de contrato para `200/204/401/403/404`.
- [ ] Registrar puertos, procesos PM2, Nginx y variables de entorno actuales sin
      copiar secretos a documentación o logs.
- [ ] Respaldar esquema y conteos de tablas de identidad.
- [ ] Medir tráfico de `/api/auth/*` en logs para formar la lista real de clientes.

Criterio de terminado:

- Las pruebas describen el contrato actual y pasan contra Infra.
- Existe una matriz de consumidores por endpoint.

Rollback: no aplica; esta fase es de solo lectura y pruebas.

### Fase 1 — Backend propio de MRTI Core

Objetivo: levantar un proceso Core sin cambiar todavía la base propietaria.

Checklist:

- [x] Crear `MRTI/server/` con Express, health check y configuración validada.
- [x] Copiar/adaptar autenticación y control de acceso desde Infra.
- [x] Conectar temporalmente a las tablas actuales de `mrti_infra`.
- [x] Conservar exactamente `/api/auth/*` y respuestas existentes.
- [x] Añadir `ecosystem.config.cjs` y puerto dedicado documentado.
- [x] Ejecutar pruebas de contrato contra Infra y Core y comparar resultados.
- [ ] Probar tokens emitidos por Core en Infra, RH, Activos, Tickets y Agent.
      **Parcial:** verificado contra Infra (`GET /me` → 200, mismo `profile.id`,
      2026-08-10) con una cuenta real. RH/Activos/Tickets/Agent validan hoy
      contra Infra vía `MRTI_INFRA_URL`/URLs propias (ver BASELINE §3), no
      contra Core — no había un endpoint propio que probar todavía; queda
      pendiente para la Fase 4 (actualización de consumidores).

Criterio de terminado:

- Core responde el mismo contrato con los mismos UUID y permisos.
- Ningún consumidor necesita cambios para usarlo.

Rollback:

- Detener Core y conservar Nginx apuntando a Infra.

### Fase 2 — Corte de tráfico de autenticación

Objetivo: hacer que Core atienda autenticación en producción.

Checklist:

- [x] Añadir una ubicación Nginx específica para `/api/auth/` antes de `/api/`.
- [x] Apuntar `/api/auth/` al puerto de Core.
- [x] Validar `nginx -t`, recargar y ejecutar smoke tests autenticados.
- [x] Confirmar login, `/me`, Centro de control y permisos en cada módulo.
      **Nota de alcance:** "cada módulo" aquí es el tráfico de navegador
      (portal principal y el admin de Infra en `/mrti-infra/`, ambos mismo
      origen vía Nginx) — Activos, RH y Agent llaman a Infra directo por
      `MRTI_INFRA_URL`/URL hardcodeada, sin pasar por Nginx, así que no se
      vieron afectados por este corte y siguen sin validar contra Core
      (eso es Fase 4).
- [x] Vigilar códigos 5xx/401 inesperados y logs durante el periodo acordado.
- [x] Mantener Infra listo para recuperar tráfico sin redeploy (backup
      automático de `activate.sh` en `/etc/nginx/sites-available/it-infra.bak`,
      restaurable con `cp` + `nginx -t` + `systemctl reload nginx`, sin volver
      a compilar ni desplegar nada).

Criterio de terminado:

- Todo el tráfico de autenticación llega a Core sin incremento de errores.

Rollback:

- Restaurar el upstream anterior de `/api/auth/` y recargar Nginx.

### Fase 3 — Base `mrti_core` y propiedad de datos

Objetivo: mover identidad fuera del esquema de Infra.

**Prerrequisito descubierto y resuelto 2026-08-10 (antes de tocar el
esquema):** `MRTI/server/src/auth/shared.js`, `accessControlRoutes.js` y
`ticketContextRoutes.js` hacían SQL directo contra `areas`/`floors`/
`buildings`/`sites`/`devices` de Infra — y uno de ellos **escribía**
`devices.assigned_user_id` desde Core. Mover `user_profiles` a otra base sin
resolver esto rompía login (`/me`), el panel de administración de
ubicación/equipo y `ticket-context` de inmediato. Se resolvió construyendo
`GET /api/self/physical-areas(/:id)`, `GET /api/self/devices` y
`POST /api/self/users/:userId/primary-device` en Infra
(`MRTI-Infra@16073b6`), y reescribiendo esos 3 archivos de Core para
consumirlos por HTTP en vez de SQL directo (`MRTI@1d63093`) — con
degradación a `null` si Infra no responde (no debe tumbar el login de
nadie) y un rollback compensatorio si Infra rechaza la asignación de
equipo después de que Core ya guardó el área física. Probado end-to-end
con datos desechables (sitio/edificio/piso/área/equipo/2 usuarios, borrados
al terminar): asignar, reasignar con conflicto (409), liberar equipo, y
apagar Infra a la mitad de la prueba para confirmar la degradación. Detalle
completo de la investigación y el diseño en el plan de esa sesión.

Checklist:

- [x] Crear migraciones idempotentes para `mrti_core`
      (`mysql/migrations/001_core_identity.sql` + `server/scripts/migrate.js`,
      mismo patrón que `MRTI-Infra`).
- [x] Copiar tablas preservando UUID, timestamps, hashes y relaciones
      (`user_profiles`, `access_areas`, `access_area_modules`; la FK de
      `user_profiles` hacia `areas` se omitió a propósito — ya se resolvió
      por API en el prerrequisito de esta misma fase, ver arriba).
- [x] Comparar conteos y checksums por tabla — MD5 idéntico en las 3 tablas
      entre `mrti_infra` y `mrti_core` justo antes del corte.
- [x] Ventana de solo lectura: no se implementó un mecanismo de software —
      dado el volumen real (3 usuarios, 2 áreas, 3 asignaciones de módulo),
      se verificaron los conteos inmediatamente antes de copiar y se copió
      en una sola transacción; no se detectaron cambios entre esa
      verificación y el corte.
- [x] Cambiar únicamente Core a `mrti_core` (`MRTI/server/.env`,
      `MYSQL_DATABASE=mrti_core`; `mrti-core-api` reiniciado en pm2).
- [x] Repetir contratos, login, permisos y pruebas de todos los
      consumidores — ver evidencia abajo.
- [x] Conservar las tablas antiguas en modo solo lectura durante
      compatibilidad — `mrti_infra.user_profiles`/`access_areas`/
      `access_area_modules` siguen con sus filas originales intactas, nada
      las escribe ya.

**Bloqueo de `CREATE DATABASE` resuelto:** jroman creó `mrti_core` y otorgó
`GRANT ALL PRIVILEGES` a `mrtops` sobre ella fuera de esta sesión (paso
root, confirmado con `SHOW GRANTS`).

**Las 8 FKs de Infra hacia `user_profiles`** (`alert_notification_reads`,
`device_connections`, `device_history`, `device_positions`, `devices` ×2,
`floor_plans`, `movement_history`) siguen intactas y resolviendo
correctamente: apuntan a la copia congelada en `mrti_infra.user_profiles`,
que conserva los mismos UUID que la copia real en `mrti_core` (nunca se
borran ni se regeneran los ids). Mientras Infra no cree usuarios nuevos por
su cuenta — y no puede, no monta rutas de escritura de identidad — esas FKs
seguirán resolviendo sin error. Quedan como deuda documentada, no como
bloqueo: se retiran en la Fase 5 (limpiar identidad de Infra).

Criterio de terminado:

- Core opera exclusivamente con `mrti_core` y los datos conciliados
  coinciden. **Cumplido** 2026-08-11.

Evidencia: `MRTI@f73ccd6` (migración + copia + corte). Verificado con un
usuario creado únicamente en `mrti_core` (no en `mrti_infra`): login vía
Core, `module-access/rh` → 204, `GET /api/rh-self` en RH y `GET
/api/tickets` en Tickets aceptaron el token emitido contra `mrti_core` —
prueba de que ya no hay ninguna dependencia oculta de `mrti_infra` en el
camino de autenticación. Usuario de prueba borrado al terminar. Login real
a través de Nginx (puerto 80) probado con credenciales inválidas → 401
esperado, sin 5xx en `error.log`.

Rollback:

- Volver `MYSQL_DATABASE` de Core a `mrti_infra` en su `.env` y `pm2 restart
  mrti-core-api` — las tablas antiguas siguen ahí, completas, nada se
  borró.

### Fase 4 — Consumidores y nombres de configuración

Objetivo: que todos los módulos reconozcan a Core como autoridad.

Checklist:

- [x] Introducir `MRTI_CORE_URL` en RH y Activos (`server/src/auth.js`) y en
      Tickets (variables `AUTH_PROFILE_URL`/`AUTH_TICKET_CONTEXT_URL`/
      `AUTH_ASSIGNEES_URL`, ya genéricas, repuntadas a `:3005`). **Agent:**
      completado 2026-08-11 — jroman aplicó `Environment=
      MRTI_AUTH_MODULE_URL=http://127.0.0.1:3005/api/auth/module-access/
      agent-core` a la unidad real (`/etc/systemd/system/mrti-monitor.service`)
      y corrió `daemon-reload`+`restart`; verificado con un token real
      emitido por Core (`module-access/agent-core` → 204, `GET
      /api/v1/agents` en Monitor → 200 con datos reales de un agente).
      Infra no necesitó esta variable: no tiene ninguna llamada HTTP a su
      propio `/api/auth/*` (valida localmente), así que no es consumidor de
      identidad en ese sentido — sí se resolvió ahí el hallazgo de nombres
      (ver abajo).
- [x] Mantener fallback temporal a `MRTI_INFRA_URL` con advertencia (RH y
      Activos emiten `console.warn` una sola vez al arrancar si
      `MRTI_CORE_URL` no está definida; Tickets no necesitó fallback porque
      sus variables ya eran genéricas).
- [x] Cambiar documentación y ejemplos de entorno (`.env.example` de RH y
      Activos; comentarios en `docker-compose.yml` de Tickets).
- [x] Validar módulo autorizado, prohibido, sesión expirada y Core no
      disponible — **verificado en Tickets** end-to-end: sin token → 401,
      token inválido → 401 (confirma que sí llega a Core, no es un fallo de
      red), Core inalcanzable (contenedor descartable con
      `AUTH_PROFILE_URL` apuntando a un puerto cerrado) → 503. **Verificado
      parcialmente en RH/Activos:** sin token → 401 contra el proceso real
      con `MRTI_CORE_URL` activa; los casos "sesión válida sin módulo" (403)
      y "administrador activo" (204/200) no se probaron con cuentas reales
      desechables como en la Fase 2 — pendiente si se quiere el mismo nivel
      de evidencia.
- [x] Añadir timeouts y mensajes `503` consistentes — RH y Activos ya los
      tenían (5s); Tickets no tenía timeout ni distinguía "Core no
      disponible" de "token inválido" y se corrigió
      (`coreClient.ts`/`auth.ts`) para igualar el patrón de RH/Activos/Agent.

Criterio de terminado:

- Ningún código nuevo describe Infra como proveedor de identidad.
  **Cumplido** 2026-08-11: con el corte de systemd de Agent aplicado, los
  cinco consumidores (RH, Activos, Tickets, Agent, y el propio Core) validan
  contra Core. Infra sigue recibiendo tráfico de identidad únicamente si
  alguien vuelve a fijar `MRTI_INFRA_URL`/quita la variable de Agent — es
  decir, solo por rollback explícito.

Rollback:

- Reponer la variable anterior; el contrato de rutas continúa compatible.
  RH/Activos: borrar `MRTI_CORE_URL` del `.env` y reiniciar con pm2. Tickets:
  revertir `docker-compose.yml` y `docker compose up -d --build backend`.
  Agent: quitar la línea `Environment=` del systemd real, `daemon-reload` +
  `restart`.

### Fase 5 — Limpiar identidad de Infra

Objetivo: dejar MRTI Infra enfocado en infraestructura.

**Corrección urgente resuelta 2026-08-11 (antes de empezar la fase formal):**
al planear esta fase se encontró que la Fase 3 (mudar `user_profiles` a
`mrti_core`) dejó una regresión activa, no sólo trabajo de limpieza
pendiente: `MRTI-Infra/server/src/auth/shared.js` (`authRequired`) y
`socket.js` seguían resolviendo la sesión de **todas** las rutas reales de
Infra (`/api/db`, `/api/monitoring`, `/api/discovery`, `/api/ups`,
`/api/mrti`, `/api/notifications`, `/api/credentials`, `/api/uploads`,
`/api/self/*`, y el WebSocket del dashboard en vivo) con SQL local contra
la copia de `user_profiles`/`access_areas`/`access_area_modules` que quedó
congelada en el corte de la Fase 3. Un usuario creado en Core después de
ese corte no podía entrar a ninguna ruta real de Infra; un cambio de rol o
una baja hecha en Core tampoco se reflejaba ahí. Se corrigió repuntando
`authRequired` y el middleware de `socket.io` a `GET
{MRTI_CORE_URL}/api/auth/me` (mismo patrón que RH/Activos), con 503 si Core
no responde. `findProfile`/`signToken` **no se tocaron** — el router
`/api/auth` de Infra que los usa se mantiene montado como respaldo de
rollback de la Fase 4 (ver checklist abajo, sigue sin hacerse). También se
quitó `user_profiles` del navegador genérico `/api/db/:table`
(`meta.js`) para que nadie edite por accidente la copia muerta.

**Bug propio encontrado en el camino:** `mrti.js` (proxy de telemetría a
MRTI Monitor) todavía aceptaba `MRTI_CORE_URL` como fallback de su propia
URL, herencia del rename de la Fase 4. Al agregar `MRTI_CORE_URL` en el
mismo `.env` para el fix de arriba, el proxy habría empezado a apuntar al
puerto de Core (3005) en vez del de Monitor (8477) — se detectó por los
logs de error (`SyntaxError: Unexpected token '<'`, HTML de un 404 de
Express donde se esperaba JSON de Monitor) segundos después de aplicarlo,
y se corrigió quitando ese fallback en el mismo commit. Ventana real de
exposición: menos de dos minutos, sin evidencia de que un usuario real la
haya visto (los hits en el log coinciden con pollers internos, no con
tráfico de navegador).

Evidencia: `MRTI-Infra@bed41ff`. Verificado con usuarios/tokens creados
únicamente en `mrti_core` (no en `mrti_infra`): rutas HTTP de Infra,
proxy de Monitor, `dbRouter` (tabla ya no expuesta), y una conexión de
WebSocket real vía `socket.io-client` (aceptada con token válido,
rechazada sin token/con uno inválido). Core apagado a propósito → 503 en
vez de 500 sin manejar.

Checklist (la fase formal, aún pendiente):

- [ ] Confirmar tráfico cero a los handlers de autenticación de Infra —
      **aún no iniciado**: requiere un período observado (revisar
      `access.log`/`error.log` de Infra por varios días) antes de retirar
      nada, ver razón abajo.
- [ ] Retirar montaje de rutas, imports y dependencias de JWT/contraseñas —
      **deliberadamente no hecho todavía**: el router `/api/auth` de Infra
      (login/registro/administración de usuarios/control de acceso) sigue
      siendo el camino de rollback de la Fase 4 para RH/Activos/Tickets
      (`MRTI_INFRA_URL` como fallback). Retirarlo ahora rompería esa red de
      seguridad antes de que la Fase 4 lleve tiempo estable.
- [ ] Eliminar del frontend de Infra la administración de usuarios/permisos.
- [ ] Mantener únicamente referencias `user_id` externas necesarias.
- [ ] No borrar tablas antiguas hasta completar el periodo de retención.

Criterio de terminado:

- Infra inicia y opera sin código de autenticación propio ni escritura de
  usuarios. **Parcialmente cumplido:** sus rutas reales ya no dependen de
  su propia copia de identidad (corrección de arriba); el router
  `/api/auth` propio todavía existe como respaldo, a propósito.

Rollback:

- De la corrección de hoy: revertir `MRTI-Infra@bed41ff` — `authRequired`/
  `socket.js` vuelven a leer local (mismas filas, nada se borró) y
  `user_profiles` reaparece en `meta.js`.
- De la fase formal (cuando se ejecute): revertir el commit de limpieza;
  las tablas antiguas siguen disponibles.

### Fase 6 — Frontera MRTI-Obs / Activos

Objetivo: eliminar duplicidad de inventario y asignaciones.

Checklist:

- [x] Inventariar columnas y endpoints equivalentes en ambos módulos.
- [x] Clasificar cada campo como patrimonial, operacional o topológico.
- [x] Designar en Activos un ID estable para el activo (`asset_uid`).
- [x] Añadir en MRTI-Obs una referencia opcional `asset_id` al dispositivo monitoreado.
- [x] Mover asignación persona-activo y equipo habitual a Activos.
- [x] Hacer que Core consulte el resumen mediante una API de autoservicio.
- [ ] Conciliar registros huérfanos, duplicados y dispositivos no patrimoniales.

Avance 2026-08-12: `MRTI-Activos@1ef90d8` agregó UUID patrimonial,
historial de asignaciones, mantenimientos, retiro lógico y la vista operacional
de solo lectura. `MRTI-Infra@06ea319` se presenta y ejecuta como MRTI-Obs,
bloquea escrituras patrimoniales en `devices`, expone la consulta por
`asset_id` y delega toda asignación a Activos. `MRTI@42cb7fc` usa el permiso
`mrti-obs` con alias compatible `mrti-infra`, obtiene el equipo habitual desde
Activos y conserva topología/estado desde MRTI-Obs.

Las migraciones `002_asset_master.sql`, `010_asset_reference.sql` y
`002_mrti_obs_module.sql` se aplicaron correctamente. Verificación de datos:
263/263 activos tienen `asset_uid` único y ninguno nulo; existen 24 dispositivos
de observabilidad y 0 enlaces automáticos. El ensayo de conciliación reportó
`matched=0`, `ambiguous=0`, `unmatched=24`; no se forzaron coincidencias por
nombre/modelo. La ficha de Activos permite vincular y desvincular manualmente
esos dispositivos.

Preparación de fuente externa 2026-08-12: `MRTI-Activos@1d83670` agregó una
plantilla de credenciales separada e ignorada por Git, verificación de permisos
de solo lectura y catálogo de tablas/columnas sin leer filas de negocio. El
procedimiento está en `MRTI-Activos/docs/EXTERNAL_SOURCE_RUNBOOK.md`. No se
configuraron credenciales reales ni se conectó la fuente; el mapeo y la
importación idempotente se implementarán después de conocer el esquema real.

Corrección de Sitios 2026-08-12: `MRTI-Infra@9c9fb1a` alineó los controles del
frontend con los permisos de la API (supervisor/administrador para topología;
técnico también para áreas), muestra errores de carga/escritura y sólo actualiza
la interfaz después de que una desactivación sea confirmada por el servidor. La
verificación de solo lectura encontró 8 sitios activos, 1 edificio activo, 0
pisos, 0 áreas y ningún huérfano: la jerarquía restante no se inventó ni se
rellenó con datos supuestos.

Pantalla en blanco corregida 2026-08-12: `MRTI-Infra@cee63ef` retiró del arranque
una comparación inválida entre `window.location.pathname` y la base relativa
`./` generada por Vite. Esa condición ejecutaba `location.replace('./')` en cada
carga y producía un ciclo infinito antes de montar React. Verificado desde la
URL reportada: `/mrti-infra/sites` conserva el sufijo en un 301 hacia
`/mrti-obs/sites`; la ruta canónica, entrada JS, CSS y chunk diferido de Sitios
responden 200.

Evidencia de ejecución: Core 10/10 contratos, MRTI-Obs 10/10 contratos
(incluye `/api/obs/assets/unlinked/devices`), Activos 2/2 pruebas de
conciliación; `npm run build` en los tres frontends y `npm run typecheck` en
Obs; `npm audit --omit=dev` sin vulnerabilidades en las dos APIs modificadas;
health checks 200 en puertos 3005/3002/3003, protecciones sin token 401,
PM2 sin errores nuevos y smoke publicado por la ruta compatible
`/mrti-infra/` → 200 con título MRTI-Obs. Los fixtures contractuales se
eliminaron al finalizar. Nginx se activó el 2026-08-12 con `nginx -t`
correcto: `/mrti-obs/` y sus assets responden 200; `/mrti-infra/` y una ruta
profunda redirigen 301 conservando el destino.

Criterio de terminado:

- Solo Activos puede modificar asignaciones y datos patrimoniales.
- Solo MRTI-Obs puede modificar estado de monitoreo y topología.

Rollback:

- Mantener lecturas del modelo anterior mediante adaptador durante compatibilidad.
- Revertir los tres commits de esta fase y reiniciar Core/Activos/Obs. Las
  migraciones son sólo aditivas: no es necesario eliminar `asset_uid` ni
  `asset_id` para recuperar el código anterior. Para recuperar el nombre PM2:
  detener `mrti-obs-api`, iniciar el commit anterior como `mrti-infra-api` y
  ejecutar `pm2 save`. Nginx conserva su respaldo en
  `/etc/nginx/sites-available/it-infra.bak` cuando se ejecute `activate.sh`.

### Fase 7 — Dashboard personal extensible

Objetivo: consolidar gestiones personales sin abrir módulos administrativos.

Checklist:

- [x] RH ofrece `/api/rh-self` con aislamiento por identidad.
- [x] Core muestra ficha, saldos y solicitudes de RH.
- [x] Activos ofrece `/api/activos-self` para equipo y asignaciones propias
      — completado 2026-08-11. A diferencia de RH (1 empleado = 1 ficha),
      la relación es 1:N (un usuario puede tener varios activos) y el
      esquema no tenía columna de vínculo: se agregó `portal_user_id` vía
      migración nueva (`MRTI-Activos@f6db4c9`, primera migración del
      repo) con auto-link por `correo_corporativo`. Devuelve lista vacía
      (no 404) sin equipo asignado, porque eso es un estado normal.
- [x] Tickets ofrece `/api/tickets-self` para tickets creados o asignados
      al usuario — completado 2026-08-11 (`MRTI-Tickets@6ba7022`). No
      necesitó migración: `requester_id`/`assigned_to` ya eran
      `VARCHAR(64)` con el UUID de Core desde la Fase 4. Ampliado el
      2026-08-27 (`MRTI-Tickets@7d2c8e4`, `MRTI@1a493f7`) para crear y
      consultar solicitudes directamente en Core sin conceder el módulo.
- [x] Core maneja widgets caídos de forma independiente; un módulo no debe
      tumbar todo el dashboard — cada widget (RH/Activos/Tickets) tiene su
      propio contenedor y su propio `try/catch` en `MRTI/src/main.js`
      (`loadEmployeeDashboard`/`loadAssetsDashboard`/`loadTicketsDashboard`,
      llamados sin `await` desde `renderPortal`, en paralelo). `MRTI@8b5d289`.
- [x] Añadir notificaciones consolidadas con enlaces a acciones permitidas
      — completado 2026-08-11 (`MRTI@473a43f`). Decisión de jroman: v1
      derivada, sin tabla ni estado de leído/no leído — se calculan al
      vuelo a partir de `rh-self`/`tickets-self` (solicitudes de RH recién
      resueltas, tickets asignados que siguen abiertos), con enlace a la
      app sólo si `canOpen(profile, moduleCode)`. `Promise.allSettled`
      para que RH sin vincular no oculte las novedades de Tickets.
- [x] Evolucionar la portada hacia un portal de trabajo sin cambiar la
      propiedad de datos — completado 2026-08-12 (`MRTI@8a64f92`). El login
      incorpora identidad visual reemplazable, estados accesibles y orientación
      de acceso; Inicio prioriza solicitudes, ausencias, activos y novedades,
      manteniendo las aplicaciones como acceso secundario. Los contadores se
      derivan exclusivamente de los contratos `*-self` existentes y conservan
      degradación independiente. El diseño de catálogo, anuncios, RBAC,
      auditoría y widgets configurables queda documentado en
      `CORE_PORTAL_EVOLUTION_PLAN.md` para fases aditivas posteriores.
- [x] Sustituir el catálogo hardcodeado mediante expansión compatible —
      completado 2026-08-12 (`MRTI@3e3a9be`). La migración idempotente
      `003_portal_catalog_audit.sql` crea y precarga `applications`; Core
      filtra el catálogo por los permisos existentes y el frontend conserva
      fallback local durante compatibilidad. El Centro de control administra
      altas, presentación, estado y orden sin permitir eliminación destructiva.
      La misma etapa incorpora `audit_events` para sesiones y cambios
      administrativos, sin contraseñas, tokens ni secretos.

Criterio de terminado:

- Un trabajador realiza gestiones personales desde Core y solo ve aplicaciones
  administrativas explícitamente asignadas. **Cumplido** 2026-08-11.

## 7. Protocolo obligatorio para cada turno de implementación

1. Leer esta guía completa y las instrucciones `AGENTS.md` aplicables.
2. Consultar el registro de progreso y elegir la primera fase no terminada.
3. Ejecutar `git status --short --branch` en cada repositorio involucrado.
4. Identificar y preservar cambios existentes que no pertenecen a la fase.
5. Escribir un plan con un único paso en progreso.
6. Hacer primero inventario y pruebas de contrato; después modificar.
7. Crear migraciones idempotentes. No editar datos reales con scripts ad hoc si
   una migración versionada puede realizar el cambio.
8. Probar en este orden:
   - pruebas unitarias;
   - pruebas de contrato/integración;
   - build;
   - validación de sintaxis y `git diff --check`;
   - migración en entorno objetivo;
   - smoke test por Nginx;
   - revisión de logs y limpieza de datos temporales.
9. Desplegar conservando una ruta de rollback comprobable.
10. Crear un commit independiente por repositorio y por fase coherente.
11. No hacer push salvo petición explícita.
12. Actualizar las secciones 9 y 10 de esta guía.

## 8. Evidencia mínima de pruebas

Cada fase debe registrar:

- comandos ejecutados;
- número de pruebas aprobadas;
- endpoints probados y códigos esperados;
- build de cada frontend/backend involucrado;
- estado PM2 y health checks;
- verificación de datos temporales eliminados;
- resultado de auditoría de dependencias cuando cambien paquetes;
- hash del commit;
- procedimiento de rollback probado o validado.

Casos de autenticación que siempre deben cubrirse:

| Caso | Resultado |
|---|---|
| Sin token | `401` |
| Token inválido/expirado | `401` |
| Sesión válida sin módulo | `403` administrativo |
| Sesión válida en autoservicio | Solo datos propios |
| Módulo desconocido | `404` |
| Autoridad no disponible | `503` en consumidores |
| Administrador activo | Acceso total según contrato |

## 9. Registro de progreso

Actualizar una fila solo con evidencia verificable.

| Fase | Estado | Fecha | Evidencia / commits |
|---|---|---|---|
| 0. Línea base y contratos | Completa | 2026-08-06 | `docs/architecture/phase0-baseline/BASELINE.md`; pruebas de contrato `MRTI-Infra/server/test/auth-contract.test.js` (9/9 OK); MRTI `cf91087`; MRTI-Infra `b45f21e` |
| 1. Backend propio de Core | Completa | 2026-08-10 | `MRTI/server/` (Express, `type:"module"`); 9 archivos de auth copiados verbatim de `MRTI-Infra/server` (`diff -q` sin diferencias); `/api/health` propio; pruebas de contrato `server/test/auth-contract.test.js` 9/9 OK contra Infra:3002 (línea base) y Core:3005; token emitido por Core aceptado por Infra `GET /me` → 200 mismo `profile.id`; pm2/nginx **no** tocados (pendiente de aprobación explícita para Fase 2); MRTI `3abc691` |
| 2. Corte de tráfico auth | Completa | 2026-08-10 | `mrti-core-api` registrado en pm2 (`pm2 save`, 0 reinicios); `MRTI/deploy/nginx.conf.example` con location `/api/auth/` → `127.0.0.1:3005` antes de `/api/`; aplicado en vivo con `sudo deploy/activate.sh` (backup automático en `it-infra.bak`, `nginx -t` OK, reload OK); verificado con el header `Content-Security-Policy` (`connect-src` sin `ws:`/`wss:` = Core, confirmado distinto del de Infra:3002 que sí los tiene); login/`/me`/`module-access`/`access-control` probados de punta a punta por Nginx (puerto 80) con usuarios desechables, mismos status codes que en Fase 0/1; tráfico real de navegador observado en `access.log` sin 5xx ni 401 inesperados; `error.log` de Nginx vacío; MRTI `40ae8a0` |
| 3. Base `mrti_core` | Completa | 2026-08-11 | Prerrequisito: `MRTI-Infra@16073b6` (`/api/self/*`), `MRTI@1d63093` (Core deja de hacer SQL directo contra `areas`/`devices`). Migración+copia+corte: `MRTI@f73ccd6` — conteos y checksums MD5 idénticos en las 3 tablas antes del corte; `MYSQL_DATABASE=mrti_core` en Core; verificado con usuario creado solo en `mrti_core` (login, `module-access/rh`, y tokens aceptados por RH/Tickets); `mrti_infra` conserva sus filas originales intactas, solo lectura. jroman creó `mrti_core`/otorgó permisos fuera de esta sesión (root) |
| 4. Consumidores a Core | Completa | 2026-08-11 | `MRTI-RH@2077ad9`, `MRTI-Activos@f78508b` (`MRTI_CORE_URL` con fallback+warning en `auth.js`); `MRTI-Tickets@9442de3` (`docker-compose.yml` repuntado a `:3005`, timeouts y 503 en `coreClient.ts`/`auth.ts`, probado con contenedor descartable → 503 real); `MRTI-Infra@97a00e3` (rename `MRTI_CORE_URL`→`MRTI_MONITOR_URL` en `mrti.js`, prerrequisito para evitar el choque de nombres — ver §10); `MRTI-Agent@97720f5` (plantilla systemd) + corte real aplicado por jroman en `/etc/systemd/system/mrti-monitor.service` el 2026-08-11 (`daemon-reload`+`restart`), verificado con token real de Core: `module-access/agent-core` → 204, `GET /api/v1/agents` → 200 con datos reales. Los cinco consumidores (RH, Activos, Tickets, Agent, Core) validan contra Core |
| 5. Limpiar identidad de Infra | En progreso | 2026-08-11 | Corrección urgente (no la fase formal): `MRTI-Infra@bed41ff` — `authRequired`/`socket.js` ya no leen la copia congelada de identidad, le preguntan a Core; de paso se corrigió un bug propio (fallback `MRTI_CORE_URL` en `mrti.js` apuntando mal) y se quitó `user_profiles` de `meta.js`. **Pendiente lo formal:** retirar el router `/api/auth` propio de Infra (sigue como respaldo de rollback de la Fase 4) y el frontend de administración de usuarios — requiere confirmar primero un período de tráfico cero |
| 6. Frontera MRTI-Obs/Activos | En progreso | 2026-08-12 | Activos `1ef90d8`; MRTI-Obs (repo aún llamado `MRTI-Infra`) `06ea319`; Core `42cb7fc`. Migraciones aplicadas; Core 10/10, Obs 10/10, Activos 2/2; builds OK; PM2 `mrti-core-api`, `mrti-activos-api`, `mrti-obs-api` online; health checks 200. Nginx activo: `/mrti-obs/` 200 y compatibilidad `/mrti-infra/*` 301. Preparación de fuente externa: Activos `1d83670`, 5/5 pruebas, build y audit OK, health 200; no hubo conexión ni escrituras externas. Corrección de Sitios: Obs `9c9fb1a`, 10/10 pruebas, typecheck/build OK, API sin token 401; topología real 8/1/0/0 sin huérfanos. Pantalla en blanco: Obs `cee63ef`, URL heredada 301 conservando `/sites`, ruta/JS/CSS/chunk 200. Pendiente: conciliar manualmente 24 dispositivos, completar la jerarquía física con datos reales y diseñar la importación al recibir el catálogo real |
| 7. Dashboard personal extensible | Completa | 2026-08-12 | Core `3d929ab`; RH `67455b5`; Activos `MRTI-Activos@f6db4c9`; Tickets `MRTI-Tickets@6ba7022`; widgets independientes `MRTI@8b5d289`; notificaciones consolidadas `MRTI@473a43f`; evolución visual `MRTI@8a64f92`; catálogo dinámico y auditoría `MRTI@3e3a9be`: migración aplicada y segunda ejecución idempotente, contratos 17/17 a través de Nginx, build y audit (0 vulnerabilidades), `/api/portal/v1/applications` sin token 401, PM2 online y 0 fixtures residuales. Rollback: restaurar `it-infra.bak`, revertir el commit, reconstruir y reiniciar Core; las tablas aditivas pueden permanecer sin afectar el código anterior |
| Transversal. CONTPAQi multisitio | Completa | 2026-08-24 | RH `1527edf`, vinculación integral `b113377`, Diseño organizacional `1f67215`, claves y alcance de puestos `aa9f439`. Las migraciones idempotentes `007_contpaq_multi_source.sql` a `010_position_codes_and_scope.sql` se aplicaron dos veces; descubre automáticamente bases con la estructura de Nóminas y conserva `MRT` como clave compatible. Carga publicada: 4 sitios, 5,004 relaciones/1,963 personas únicas/311 activas vigentes; 13,461 eventos, 536,054 periodos, 67,166 recibos y 1,894 finiquitos, sin errores. Los 5,004 expedientes del espejo tienen vínculo explícito con la ficha central; la conciliación posterior a cada sincronización alimenta dashboard, directorio, vacaciones, selectores y Diseño organizacional. La estructura vigente contiene 311 puestos ocupados y 38 unidades: MAT Metals 4/2 departamentos, MRT 54/7 y MineWorks 253/26; conserva los 54 puestos y 41 relaciones manuales previas, sin activos sin puesto ni bajas con asignación vigente. Los 311 puestos tienen `position_code` único y descripción extensa editable; búsqueda, relaciones, paneles y `GET /positions/by-code/:code` exponen la clave, que la sincronización no reemplaza. Frontend agrupado/filtrado por sitio, perfiles multirrelación y actualización manual; empleados y diseño cada 2 h e historial diario. Pruebas 22/22, build, `git diff --check`, health 200, `/rh/` 200, ruta protegida sin token 401, PM2 online y sin errores nuevos; segunda conciliación organizacional creó 0 y actualizó 0. Rollback: detener RH, revertir `aa9f439`, `1f67215`, `b113377` y `1527edf`, cerrar/desactivar sólo las asignaciones y puestos registrados en `contpaq_position_links`, desactivar unidades cuya descripción indique origen sincronizado y las raíces de `contpaq_site_org_units`, reconstruir/reiniciar; las columnas/tablas aditivas pueden permanecer y CONTPAQi no se modifica. |
| Transversal. Espejo seguro CONTPAQi | Completa | 2026-09-02 | RH `9535281`. La migración aditiva e idempotente `015_contpaq_safe_mirror.sql` se aplicó dos veces; registra ejecuciones, fotografías de esquema, versiones y decisiones administrativas sin escribir en SQL Server. Empleados e históricos se actualizan cada 2 h, escalonados; una lectura vacía se pone en cuarentena y las ausencias no alimentan como activas RH/organigrama ni se eliminan automáticamente. Línea base real: 5 fuentes, 5,048 relaciones y 619,418 históricos leídos; 0 ausencias de empleado, 0 cambios de esquema y 1 finiquito ausente conservado como pendiente. Segunda lectura de empleados: 5,048 procesados, 0 cambios falsos después de normalizar precisión salarial. Pruebas 39/39, build Vite correcto, `git diff --check`, health 200, `/rh/control-contpaq` 200, API protegida sin sesión 401, PM2 online y sin errores nuevos. Rollback documentado en `MRTI-RH/docs/CONTPAQ_SAFE_MIRROR.md`; las tablas aditivas pueden permanecer y CONTPAQi no requiere reversión. |
| Transversal. Numeración canónica RH/CONTPAQi | Completa | 2026-09-02 | RH `4938d3a`. `employees.employee_number` adopta exactamente `codigoempleado` de la relación principal y conserva la empresa en `employee_number_source`, porque CONTPAQi reutiliza códigos entre empresas. Las altas únicamente RH reciben `RH-####` mediante una secuencia transaccional y cambian automáticamente al código real al vincularse por CURP/RFC; el `employees.id` estable conserva expediente, documentos, vacaciones y cuenta de Core. La migración idempotente `016_canonical_employee_numbers.sql` se aplicó dos veces. Resultado real: 2,006/2,006 fichas con empresa+código canónicos, 0 discrepancias, 0 duplicados dentro de una fuente y 0 conflictos; 2,006 cambios auditados. Segunda conciliación: 0 actualizaciones. Pruebas 42/42, build Vite y `git diff --check` correctos; health, `/rh/` y PM2 en línea, ruta protegida directa y vía Nginx 401 sin sesión, y sin errores nuevos (último error previo: 2026-08-20). Rollback y consultas en `MRTI-RH/docs/EMPLOYEE_NUMBERING.md`; CONTPAQi permanece de sólo lectura. |
| Transversal. Captura y árbol de jefaturas | Completa | 2026-08-25 | RH `36fdc1f`. Se reemplazó el selector de cientos de puestos por búsqueda contextual por clave, puesto, ocupante y unidad, con recomendación local y ampliación explícita a toda la empresa; Diseño organizacional incorpora vista Jerarquía de puestos con layout descendente automático, zoom, ramas expandibles, búsqueda y navegación móvil. La lectura real confirma 311 puestos activos, 41 jefaturas directas y 270 raíces todavía sin jefe; la vista no inventa relaciones y se irá consolidando al capturarlas. Sin migración ni cambio de API/datos. Pruebas 22/22, build con división diferida del motor gráfico, audits frontend/backend 0 vulnerabilidades, `git diff --check` limpio, `/rh/` y chunks publicados 200, API protegida sin sesión 401, PM2 online y sin errores nuevos (último error previo: 2026-08-20). Rollback: revertir `36fdc1f` y reconstruir el frontend RH; las 41 relaciones existentes y el resto de datos permanecen intactos |
| Transversal. Perfil RH consolidado | Completa | 2026-08-25 | RH `ea5a241`. La página de perfil resuelve el espejo CONTPAQi vigente desde `contpaq_mirror_id` de la ficha central cuando el enlace de origen sólo incluye el ID RH; dashboard, organigramas y futuros accesos muestran así sueldo, turno, periodo e historial igual que el directorio. Evidencia real: Alejandro Saenz Contreras, RH 1359 → espejo 190988 de `ctMineWorks_4`, activo, con ambos salarios, turno, periodo, 2 periodos históricos y 1 recibo. Sin migración, cambio de API ni escritura de datos. Pruebas 25/25, build publicado, audits frontend/backend 0 vulnerabilidades, `git diff --check` limpio, `/rh/` y chunk 200, API protegida sin sesión 401 y PM2 online. Rollback: revertir `ea5a241` y reconstruir el frontend RH; vínculos, espejo y datos fuente permanecen intactos |
| Transversal. Directorio RH por sitio | Completa | 2026-08-26 | RH `18b5bbb`. Al seleccionar una tarjeta o el selector de sitio, el directorio proyecta exclusivamente la relación laboral de esa fuente: estado, código, puesto, departamento, ingreso, etiqueta y conteos Activos/Bajas/Todos dejan de heredarse de la relación principal de otro sitio. Sin sitio conserva la vista consolidada. Conteos reales verificados: MAT METALS 4 activos, Nominas_MRT 56, MINEWORKS 257 y ANT MWKS 0; 27/27 pruebas, build publicado, `git diff --check` limpio, `/rh/` 200, API protegida sin sesión 401 y PM2 online. Sin migración, API ni escritura de datos. Rollback: revertir `18b5bbb` y reconstruir el frontend RH. |
| Transversal. Vista completa del organigrama | Completa | 2026-08-26 | RH `ef72c63`. Organigrama y Jerarquía de puestos conservan las vistas cómoda/compacta y añaden “Vista completa” más una acción contextual “Mostrar los N”. Esta modalidad incluye todas las raíces y ramas del alcance elegido, usa tarjetas compactas, desactiva controles de expansión redundantes y permite zoom hasta 10 % para ajustar conjuntos amplios en el lienzo; móvil muestra la misma estructura completa en navegación vertical. Sin migración, API ni escritura de datos. Pruebas 28/28 (incluye contexto completo de 29/29), build publicado, `git diff --check` limpio y `/rh/organigrama` 200. Rollback: revertir `ef72c63` y reconstruir el frontend RH. |
| Transversal. Árbol empresarial y jefes externos | Completa | 2026-08-26 | RH `0e788a9`. Organigrama incorpora “Árbol completo” para visualizar los 316 puestos activos con sus 316 ocupantes y las 42 relaciones directas existentes; los puestos sin jefe capturado permanecen como raíces independientes, sin conexiones inventadas. Al filtrar una unidad, la opción “Jefe externo” agrega sólo el jefe directo que cruza el límite y su arista, sin recorrer ancestros superiores; verificado en datos reales con Departamento de Compras (11 puestos), Marvin Orozco → Álvaro Urquidez, sin incorporar al jefe de Álvaro. Si no existe jefe directo externo no añade nada. Layout real de 316 nodos en 320 ms, 29/29 pruebas, build publicado, `git diff --check` limpio, `/rh/organigrama` 200 y snapshot sin sesión 401. Sin migración, API ni escritura de datos. Rollback: revertir `0e788a9` y reconstruir el frontend RH. |
| Transversal. Tarjetas verticales del organigrama | Completa | 2026-08-26 | RH `4c5fe1b`. Las tarjetas del lienzo colocan avatar centrado sobre nombre y puesto, admiten dos líneas por dato y reducen el ancho compacto de 224 a 164 px; el espaciado horizontal también baja de 30 a 22 px. Medición ELK con los 316 puestos reales: ancho total 6,657→4,881 px (−27 %), layout 140 ms; aumenta la altura para conservar legibilidad. Estados de foco, jefe externo, expansión y móvil permanecen compatibles. Sin migración, API ni datos modificados. Pruebas 29/29, build publicado, `git diff --check` limpio y `/rh/organigrama` 200. Rollback: revertir `4c5fe1b` y reconstruir el frontend RH. |
| Transversal. Sistema visual del portal | Completa | 2026-08-24 | Contrato visual `docs/architecture/PORTAL_VISUAL_SYSTEM.md`; Core `2a51f1a`, Activos `bee353a`, Agent `78b7f82`, MRTI-Obs `b17a448`, RH `ba8ba67`, Tickets `a10717e`. Paleta dorado/piedra y clave global `mrti_theme` verificadas en claro/oscuro; Core y Tickets incorporan shell lateral responsive, Agent incorpora sidebar/drawer y deja la paleta azul fija, y las gráficas/racks de Obs usan tokens temáticos. Builds 5/5, typecheck Obs/Tickets correcto, pruebas Tickets 2/2, `git diff --check` limpio y smoke local 6/6 con HTTP 200. Rollback: revertir el commit correspondiente y reconstruir sólo ese frontend; no hay migraciones, APIs ni datos modificados |
| Transversal. Barras laterales alineadas con Core | Completa | 2026-08-30 | Monitor `1c6ef72`, Activos `4907e04`, RH `b9aa392`, Tickets `0ea9089` y Agent Core `8c00ac8`. Los cinco módulos adoptan el contrato de Core: 256/64 px, superficie dorado/piedra, marca administrable, navegación propia, cambio de módulo, accesos de cuenta, controles inferiores, persistencia del colapso y drawer móvil con backdrop, Escape y bloqueo de desplazamiento. Agent Core sustituyó su selector superior por la barra lateral y conservó agentes/descargas; Monitor conserva fuera del shell su wallboard. Typecheck y cuatro builds web correctos; RH 35/35, Tickets 2/2 y Go `go test ./...` correctos. El lint global de Monitor mantiene 31 errores preexistentes fuera de los archivos modificados. Publicación verificada con seis frontends HTTP 200, APIs protegidas 401, Tickets Docker online y Agent reiniciado con binario previo en `bin/mrti-monitor.bak-sidebar-20260830`. Rollback: revertir el commit de cada módulo, reconstruir los frontends y restaurar dicho binario para Agent; no hay migraciones, cambios de API ni datos persistentes. |
| Transversal. Tema compartido persistente | Completa | 2026-08-30 | Core `57da694`, Monitor `4df3fcd`, Activos `e04e6e4`, RH `d88beb3`, Tickets `02d714b` y Agent Core `e977a1f`. La selección claro/oscuro conserva `mrti_theme` en el origen común, sincroniza pestañas mediante `storage` y persiste sólo el campo `theme` en las preferencias de Core sin alterar densidad ni widgets. Agent Core, publicado en el puerto 8477 y por ello con almacenamiento aislado por origen, recibe el tema junto al token, consulta además la preferencia central al cargar y puede actualizarla por CORS autorizado. Core 32/32, Tickets 2/2, typecheck Monitor, cinco builds web y Go `go test ./...` correctos; preflight 204 con `Access-Control-Allow-Origin`, seis frontends 200, Core/Agent activos y Tickets Docker online. Rollback: revertir los seis commits, reconstruir los frontends, reiniciar Core/Agent y restaurar `bin/mrti-monitor.bak-theme-20260830`; no hay migración ni cambio destructivo de datos. |
| Transversal. Contraste claro/oscuro | Completa | 2026-08-30 | Core `a3341f8`, Monitor `ae3f8c9`, Activos `89546c8`, RH `be78605`, Tickets `3f8c428` y Agent Core `f1547c6`. Se separaron colores decorativos de los usados como texto para dorado, verde, ámbar, violeta y rojo; el texto secundario claro cumple 4.5:1 incluso sobre la superficie beige más exigente y Core dejó de usar una tarjeta blanca translúcida que se volvía gris en oscuro. Auditoría iterativa autenticada sobre 33 rutas × 2 temas: 4,033 → 3,065 → 92 → 11 → 0 fallos WCAG; cinco builds web, typecheck Monitor, RH 35/35, Tickets frontend 2/2, backend 13/13 y Go `go test ./...` correctos. El lint global de Monitor conserva 31 errores preexistentes; el archivo modificado pasa ESLint aislado. Seis frontends y cinco health checks publicados respondieron 200; Tickets Docker y `mrti-monitor.service` activos. Rollback: revertir cada commit, reconstruir el frontend correspondiente y, para Agent, restaurar `bin/mrti-monitor.rollback-contrast`; no hay migración, API ni datos persistentes modificados. |
| Transversal. Shell y encabezado unificados | Completa | 2026-08-31 | Core `bd983c4`, Activos `6128d51`, RH `a03988f`, Legal `bc3c099`, Monitor `9d0a582`, Tickets `d929666` y Agent Core `27033ac` + `45eed45`. Todos conservan su navegación y acciones propias dentro del contrato lateral 256/64 px; el encabezado de 72 px queda `sticky` en escritorio y móvil, muestra contexto de la pantalla, campanilla y perfil donde corresponde. Monitor conserva búsqueda y alertas técnicas; Agent conserva agentes y descargas, incluida la plantilla de descargas antes aislada, con cambio de módulo, cuenta, tema, sesión y notificaciones. Seis builds web, typecheck de Tickets, RH 35/35, Legal 10/10, Tickets 2/2 y Go `go test ./...` correctos; ocho superficies publicadas respondieron 200, tres APIs protegidas 401, Tickets Docker y `mrti-monitor.service` activos. Rollback: revertir cada commit, reconstruir el frontend correspondiente y restaurar `bin/mrti-monitor.rollback-unified-shell-20260831` para Agent; no hay migración, API ni datos persistentes modificados. |
| Transversal. Marca lateral idéntica | Completa | 2026-09-01 | Monitor `4b1d14f`, Activos `7cb2618`, RH `2ca7f5b`, Legal `34a496e`, Tickets `b253481` y Agent Core `e44121f` + `818ae1c`. Las seis barras usan la cabecera de Core: logo 42 px, nombre en Big Shoulders Display, subtítulo Minera Río Tinto en IBM Plex Sans y el mismo ritmo de 61 px; el logo conserva el acceso a Mi espacio y desaparece la opción textual redundante “Volver al Core”. Typecheck/build de Monitor, cinco builds web, RH 35/35, Legal 10/10, Tickets 2/2 y Go `go test ./...` correctos. Monitor, Activos, RH, Legal, Tickets, Agent y descargas respondieron HTTP 200; Tickets quedó publicado en Docker sin incorporar sus cambios locales de backend, y Agent reinició con el binario nuevo. Rollback: revertir el commit de cada módulo, reconstruir el frontend correspondiente y restaurar `/var/www/mrt/MRTI/bin/mrti-monitor.rollback-sidebar-brand-20260901` para Agent; no hay migración, API ni datos persistentes modificados. |
| Transversal. Corrección literal de marca lateral | Completa | 2026-09-01 | Monitor `6a5597c`, Activos `128bbf3`, RH `e69f5bb`, Legal `68608fe`, Tickets `4fa6f2e` y Agent Core `3171cb4`. Se corrigió un `+` suelto que invalidaba la regla exterior de la barra en Monitor, Activos y RH; la marca ahora muestra literalmente **MRTI / Minera Río Tinto**, con el padding `18px 14px` y las medidas del Core, mientras el nombre de cada módulo permanece en su encabezado de contenido. RH no contiene “Volver al Core” en fuente, build ni bundle publicado. Agent sirve logo y fuentes embebidos desde `/portal-assets/*`, eliminando los 404 y la dependencia entre orígenes del puerto 8477. Typecheck/build de Monitor; builds de Activos, RH, Legal y Tickets; RH 35/35, Tickets 2/2 y Go `go test ./...` correctos. Siete vistas/recursos publicados respondieron HTTP 200, Tickets se recreó sólo en frontend y su backend conservó `StartedAt=2026-09-01T16:09:27.566414283Z`; Agent quedó activo con binario idéntico al build. Rollback: revertir los commits indicados, reconstruir cada frontend y restaurar `/var/www/mrt/MRTI/bin/mrti-monitor.rollback-core-exact-brand-20260901` para Agent. |
| Transversal. Accesos de tickets sin salida de Core | Completa | 2026-08-30 | Core `09180f8`. Los accesos laterales **Nuevo ticket** y **Mis tickets** dejaron de enlazar a las rutas operativas de MRTI Tickets: el primero vuelve al dashboard, abre el formulario de autoservicio y enfoca el título; el segundo carga y desplaza al historial personal dentro de Core, incluso si el widget estaba oculto en las preferencias, sin cambiar esa preferencia persistida. El enlace explícito de gestión completa permanece sólo dentro del resultado para usuarios con permiso operativo. Core 32/32, build correcto, bundle publicado con ambos accesos convertidos en acciones internas y frontend 200. Sin cambio de API, permisos ni datos. Rollback: revertir `09180f8` y reconstruir Core. |
| Transversal. Detalle y corrección temporal de tickets en Core | Completa | 2026-08-31 | Tickets `f932866`; Core `f8ce3f1` y acceso universal al autoservicio `7e2ef4e`. Cada fila de **Mis tickets** abre dentro de Core un detalle con descripción, estado, área, clasificación, prioridad y fechas; se retiró el enlace de gestión completa al módulo. Cualquier usuario autenticado conserva **Nuevo ticket** y **Mis tickets** aunque no tenga permiso operativo de Tickets. Sólo el creador puede corregir título y descripción durante los primeros 10 minutos: Tickets calcula y devuelve la ventana, registra la edición en su auditoría y la condición temporal se repite de forma atómica en el `UPDATE`; asignados y ediciones tardías quedan en consulta. Tickets 16/16 y builds de backend/Core correctos. Contrato real con viewer sin acceso al módulo: permiso 403, alta 201, detalle 200 editable, edición 200 y edición a los 11 minutos 409 `EDIT_WINDOW_EXPIRED`. Prueba autenticada móvil confirmó descripción, formulario, ausencia de enlace `/tickets/`, modal dentro del viewport y permanencia en `/`; fixture y auditoría residuales 0. Docker Tickets y Core publicados con health 200. Rollback: revertir los tres commits, reconstruir backend Tickets y frontend Core; no hay migración ni datos persistentes que retirar. |
| Transversal. Recuperación del Resumen operativo de Tickets | Completa | 2026-08-31 | Tickets `c354e90`. La consulta **Carga por responsable** escapó el alias MySQL reservado `HIGH_PRIORITY`; el error de sintaxis de esa consulta ya no rechaza el `Promise.all` completo de `/api/dashboard/summary`. Backend 16/16 y TypeScript correctos; contenedor reconstruido y health 200. Contrato publicado: sesión sin equipos 200 con resumen válido en ceros y administrador 200 con 4 totales, 3 activos, 2 áreas, 1 responsable y 3 recomendados. Navegador autenticado mostró **Centro operativo** sin error en ambos alcances, respetando el filtro por membresía. Rollback: revertir `c354e90` y reconstruir sólo el backend de Tickets; no hay migración ni cambio de datos. |
| Transversal. Gestiones laborales sólo mediante Tickets | Completa | 2026-08-30 | Core `59f4a05`. Se retiraron del dashboard el acceso **Solicitar ausencia**, el formulario y cancelación directa contra RH, el contador de ausencias y las notificaciones paralelas de solicitudes RH. Core conserva únicamente ficha laboral y saldos como consulta, e indica que vacaciones, permisos y demás gestiones se levantan mediante ticket; el acceso **Nuevo ticket** continúa abriendo el autoservicio interno. Core 32/32, build publicado, bundle sin referencias al formulario ni a escrituras `leave-requests`, frontend y health 200. Sin cambio de API ni datos existentes. Rollback: revertir `59f4a05` y reconstruir Core. |
| Transversal. Notificaciones en campanilla | Completa | 2026-08-30 | Core `6dc216c`. Las novedades dejaron de ocupar una tarjeta, contador y sección dentro del dashboard; ahora viven en un panel flotante accesible desde la campanilla superior en todas las vistas de Core, con contador, `aria-expanded`, cierre explícito, clic exterior, Escape y actualización cada minuto. La preferencia dejó de presentarlas como widget del dashboard. Core 32/32, build publicado, prueba real autenticada en 1440×900 y 390×844 confirmó 0 secciones antiguas, panel dentro del viewport y cierre por Escape; frontend y health 200, fixture eliminado. Rollback: revertir `6dc216c` y reconstruir Core; no hay migración, API ni datos persistentes modificados. |
| Transversal. Campanilla disponible en todos los módulos | Completa | 2026-08-30 | Core `3d264b5`, Monitor `adf032d`, Activos `076cab6`, RH `c063482`, Tickets `a4a19e7` y Agent Core `53e80cf`. Core publica `GET /api/portal/v1/notifications`, valida la sesión y normaliza asignaciones personales y novedades de equipo de Tickets sin duplicar un mismo ticket; cada módulo consulta esa fuente, refresca cada minuto y abre el panel local sin navegar de regreso a Core. Monitor combina las novedades con su campanilla de alertas técnicas existente. Los enlaces operativos sólo se entregan a quien puede abrir Tickets y apuntan al ticket específico. Core 35/35, cinco builds web y Go `go test ./...` correctos; endpoint interno y Nginx 200 con 2/2 fuentes sanas, seis frontends 200 y prueba autenticada de navegador confirmó panel con contenido en los seis módulos y campana dentro del viewport móvil. PM2, Tickets Docker y `mrti-monitor.service` quedaron activos. Rollback: revertir los seis commits, reconstruir los frontends, reiniciar Core y restaurar `bin/mrti-monitor.bak-notifications-20260830` para Agent; no hay migración ni cambio de datos persistentes. |
| Transversal. Integración de `_incoming-activos` | Completa | 2026-09-02 | MRTI-Activos `8da09bb` incorpora en su shell oficial los catálogos, alertas y 53 documentos del sistema de entrada sobre una copia MySQL local sincronizada con ActivosTI. Core continúa siendo autoridad única de identidad y acceso; no se migran usuarios ni JWT propios. Las credenciales NVR/red quedan cifradas con AES-256-GCM, sólo un administrador puede revelarlas y las columnas legadas en texto plano se vaciaron. Las bajas de catálogos son archivado restaurable. La vista fuente devuelve 272 filas para 270 centros; las dos variantes de `TI-00142` y `TI-00154` se conservan en una bandeja de conflictos, sin descarte silencioso. Migraciones `005`/`006`/`007`, importación de documentos idempotente, 9/9 pruebas, build y health correctos; API sin sesión 401 y PM2 online. Rollback: revertir MRTI-Activos, reconstruir y reiniciar; tablas/columnas/PDF aditivos pueden permanecer. |
| Transversal. Recursos de marca administrables | Completa | 2026-08-25 | Core `7b277ff`; migración aditiva `004_brand_assets.sql` aplicada y segunda ejecución idempotente. El recurso anterior quedó persistido con 1,213 bytes y SHA-256 verificado; catálogo y binarios requieren sesión, y alta/baja exigen rol `administrator` en servidor. Carga real por contrato, lectura, descarga, archivado lógico y rechazo de SVG ejecutable verificados: 21/21 pruebas Core, build OK, audit 0 vulnerabilidades, `git diff --check` limpio, Core/Nginx health 200, rutas protegidas 401, PM2 online sin errores y 0 fixtures residuales. MySQL permite 64 MB y la aplicación limita cada imagen a 10 MB. Rollback: revertir `7b277ff`, reconstruir el frontend y reiniciar `mrti-core-api`; `brand_assets` puede permanecer sin afectar el código anterior y `public/brand/logo-color.svg` conserva el catálogo estático previo |
| Transversal. Apariencia desde recursos de marca | Completa | 2026-08-25 | Core `fd71519`; migraciones aditivas `005_brand_appearance.sql` y `006_clear_archived_brand_appearance.sql` aplicadas y segunda ejecución idempotente. El administrador asigna desde el catálogo el logo global y el fondo del login; la pantalla previa a sesión sólo puede leer esos dos usos públicos. Se respetó el archivado previo del logo registrado por `jroman@mrtcorporativo.mx` y se dejó la asignación en predeterminado, sin reactivar datos retirados. Contratos 22/22 cubren lectura pública limitada, prohibición para viewer, asignación, contenido real y bloqueo de baja mientras está en uso; build OK, audit 0 vulnerabilidades, `git diff --check` limpio, apariencia/portal/logo predeterminado 200, PM2 online y 0 fixtures residuales. Rollback: revertir `fd71519`, reconstruir y reiniciar Core; las tablas aditivas pueden permanecer y el frontend anterior seguirá usando `public/company-logo.svg` |
| Transversal. Persistencia de apariencia durante mantenimiento | Completa | 2026-08-28 | Core `dfe0ccd`. El contrato de recursos de marca ahora captura y restaura exactamente la asignación previa de `login_background`, incluido actor y fecha, en lugar de dejar la ranura en `NULL` al retirar su fixture. La suite completa pasó 30/30 y una comparación antes/después confirmó que las pruebas conservaron la fila sin cambios. Reinicio real de `mrti-core-api`: asignación idéntica antes/después, catálogo público 200 y contenido del fondo 200. Sin migración ni cambio de datos. Rollback: revertir `dfe0ccd`; el runtime seguirá persistiendo en MySQL, pero volver a ejecutar la prueba anterior podría limpiar el fondo configurado. |
| Transversal. Candidatos activos para equipos de Tickets | Completa | 2026-08-28 | Core `a48b7c4`. `/api/auth/assignees` devuelve todos los perfiles activos de Core, sin exigir que su área ya tenga permiso de Tickets; la configuración local de **Equipos de atención** continúa excluyendo integrantes existentes y la asignación de un ticket sigue limitada al equipo de su área. La población real pasó de 3 candidatos filtrados a 11 usuarios activos. Core 31/31, `git diff --check` limpio, health 200 y PM2 online. Sin migración ni cambio de datos. Rollback: revertir `a48b7c4` y reiniciar Core; las membresías locales existentes no cambian. |
| Transversal. Novedades y administración central de equipos de Tickets | Completa | 2026-08-28 | Tickets `ca8bdd4`; Core `11016cd` y refresco `5ce3c6e`. Los integrantes reciben en **Mi espacio** hasta tres novedades de tickets abiertos y sin responsable que llegaron a sus áreas; al asignarse a una persona, la alerta grupal cede a la notificación individual existente. Mientras el dashboard permanece abierto, las novedades se actualizan cada minuto. El Centro de control de Core incorpora la pestaña **Equipos de Tickets**, consulta y modifica las membresías mediante APIs de Tickets y sólo ofrece usuarios activos; el acceso anterior del módulo redirige al Core. Tickets conserva la propiedad de `business_area_members`. Pruebas: backend Tickets 13/13, frontend 2/2, builds de Tickets/Core y `git diff --check` correctos. Contrato real: integrante agregado, ticket de su área visible, ticket de otra área oculto, alta/baja de membresía correctas y 0 fixtures residuales. Docker Tickets online. MRTI Monitor volvió a cargar después de activar con restart las correcciones Core↔Monitor ya presentes: typecheck, 12/12, frontend/chunks/health 200 y PM2 online. Rollback: revertir `ca8bdd4`, `11016cd` y `5ce3c6e`, reconstruir Core/Tickets y recrear sus contenedores; no hay migraciones ni datos nuevos que retirar. |
| Transversal. Auditoría de cambios de plataforma | Completa | 2026-08-26 | Contrato `docs/architecture/PLATFORM_AUDIT_CONTRACT.md`; Core `20be706`, RH `2a97925`, Activos `0718197`, Tickets `d3bb2a9`, MRTI-Obs `0b5c3c3`. Cada módulo conserva la propiedad local del historial y Core consolida sólo lectura con degradación por fuente; captura mutaciones exitosas, actor de Core, fecha, recurso, petición y resultado con saneamiento recursivo de secretos y datos sensibles. Migraciones aditivas de RH, Activos y Obs ejecutadas dos veces; Tickets reutiliza `audit_logs`. Pruebas unitarias: Core 24/24, RH 31/31, Activos 7/7, Tickets 6/6, Obs 12/12; builds correctos y no cambiaron dependencias. Smoke publicado: cinco health 200, cinco rutas sin token 401 y consulta temporal con administrador 200, 20 eventos y 5/5 fuentes disponibles; fixture y su auditoría retirados. Los cuatro procesos PM2 y el backend Docker de Tickets quedaron online, sin errores nuevos. Rollback: revertir cada commit, reconstruir y reiniciar sólo su servicio; las tablas aditivas pueden permanecer y no se elimina historial. |
| Transversal. Aislamiento de Tickets por área | Completa | 2026-08-27 | Tickets `abe3b63`; Core `b613f1f`. Cada ticket conserva área destinataria propia y clasificación validada Área → Categoría → Detalle; bandeja, tablero, detalle, comentarios, adjuntos, historial, asignación, estado, SLA y reportes se limitan a membresías locales `business_area_members`, con excepción explícita para administrador global. Core mantiene UUID, identidad y acceso al módulo; Tickets sólo guarda referencias estables sin FK entre bases. Un administrador configura integrantes en **Equipos por área** y el autoservicio de Core muestra el mismo selector dependiente. Migraciones idempotentes `004_business_areas.sql`, `005_category_hierarchy.sql` y `006_ticket_target_area.sql` ejecutadas dos veces: 4 áreas, 16 categorías y 57 detalles únicos. Pruebas: Tickets backend 12/12, frontend 2/2, Core 26/26; tres builds correctos y `git diff --check` limpio. Smoke por Nginx: sesiones administrador/Pagos 200, opciones 4/16/57, combinación manipulada 400 `INVALID_CATEGORY`; fixture temporal confirmó que Pagos lista y abre sólo Pagos (200) y rechaza TI (403 `AREA_FORBIDDEN`), después quedó 0 tickets y 0 membresías de prueba. Backend/frontend Docker y PM2 Core online. Rollback: revertir `abe3b63` y `b613f1f`, reconstruir Tickets/Core y reiniciar `mrti-core-api`; `business_area_id` y catálogos aditivos pueden permanecer, y el código anterior continúa resolviendo área por categoría. |
| Transversal. Nómina MINERA CUITABOCA | Completa | 2026-08-26 | RH `79411b1`, etiqueta completa `892bae5`. Se identificó como fuente operativa `ctMINERA_CUITABOC` (la base homónima terminada en `A` está vacía); el usuario `mrt` quedó limitado a `db_datareader`. Esta versión no incluye `Vista_Empleados`, por lo que RH detecta el esquema heredado y reconstruye la misma proyección desde `nom10001` y catálogos de puesto, departamento, turno, periodo y registro patronal. Importación publicada: 32 relaciones, 25 activas, 32 vínculos, 25 puestos ocupados y 3 departamentos; historial con 51 eventos, 395 periodos, 344 recibos y 7 finiquitos. Segunda ejecución creó 0 personas y 0 puestos, conciliación actualizó 0. Pruebas 35/35, build OK, health 200, ruta sin sesión 401 y consulta administrativa 200 con 5 fuentes y CUITABOCA sin error. El nombre corto truncado por el esquema antiguo se completa desde la razón fiscal. Sin migración ni escrituras en SQL Server. Rollback: revertir `892bae5` y `79411b1`, y reiniciar RH; conservar los datos reales importados y deshabilitar la fuente si se requiere detener su refresco, sin borrar expedientes ni historial. |
| Transversal. Cuentas lectoras desde RH | Completa | 2026-08-26 | Core `53ab6f5`; RH `5d18689`. RH expone únicamente expedientes activos con correo corporativo único y Core conserva la propiedad de identidad: creó 6 cuentas nuevas con UUID, rol `viewer`, sin área ni módulos, vinculó 7 expedientes incluyendo una cuenta existente y exigió contraseña personal en el primer acceso. Se excluyeron de forma segura los 6 expedientes activos que reutilizan `igutierrez@mrtcorporativo.mx`; no hubo conflictos. Contraseñas temporales individuales entregadas una sola vez en un CSV local con modo `0600`. El Centro de control se compactó en cuatro pestañas, formularios plegables y listas con desplazamiento. Migración `007_password_onboarding.sql` ejecutada dos veces; Core 25/25, RH 35/35, ambos builds OK, health 200, candidatos sin sesión 401, prueba real de una cuenta sin aplicaciones y acceso a RH 403; PM2 online. Rollback: revertir ambos commits y reconstruir/reiniciar Core y RH; la columna aditiva puede permanecer. Las identidades ya entregadas no se borran automáticamente: si se revoca el alta, desactivar explícitamente esas cuentas y retirar sus vínculos RH conservando la auditoría. |
| Transversal. Contraseña de 6 caracteres y shell adaptable | Completa | 2026-08-27 | Core `3fce519`, RH `e721815`, Activos `33318bf`, MRTI-Obs `caf665f`, Tickets `802b6bf`. Core acepta contraseñas de 6 a 128 caracteres en altas, cambios propios y restablecimientos administrativos; las interfaces de Core y el respaldo compatible de Obs muestran la misma regla. Prueba real publicada cambió e inició sesión con dos claves distintas de 6 caracteres y retiró el fixture. En escritorio, los cinco módulos fijan la barra a `100dvh`; Core y Tickets calculan explícitamente contenido de `100%-256px`/`100%-64px`, RH y Activos retiraron el máximo global, y Obs conserva su contenido fluido. Core 26/26, RH 35/35, Tickets 2/2, typecheck Obs y cinco builds OK; cinco frontends 200, health Core 200, APIs protegidas de RH/Activos/Obs/Tickets 401, procesos PM2 y contenedor Tickets online. Tickets se publicó desde un snapshot limpio para excluir trabajo local ajeno. Sin migración ni cambio de datos persistentes. Rollback: revertir el commit de cada módulo, reconstruir su frontend y reiniciar sólo Core/Obs por la política de contraseña; no requiere restauración de base. |
| Transversal. Autoservicio de tickets en Core | Completa | 2026-08-27 | Core `1a493f7`; Tickets `7d2c8e4`. Las acciones “Nuevo ticket” y “Mis tickets” permanecen dentro de Core para todos los usuarios autenticados. `/api/tickets-self/options`, `POST /api/tickets-self` y `GET /api/tickets-self/me` validan identidad en Core sin exigir el módulo; el servidor fija `requester_id` desde el token, incorpora contexto físico/equipo cuando existe y sólo devuelve tickets creados o asignados al UUID autenticado. El módulo operativo conserva su middleware: una cuenta `viewer` sin área obtuvo opciones 200, alta 201 y lista propia 200, pero `/api/session` de Tickets respondió 403. El ticket y usuario de prueba, su historial y auditoría se retiraron; conteo residual 0. Tickets 8/8, Core 26/26 y ambos builds OK; frontend Core 200, backend/contenedores online. La imagen de backend se extendió sobre la imagen publicada para preservar otros cambios locales ya desplegados. Sin migración ni escritura cruzada entre bases. Rollback: revertir ambos commits, reconstruir Core y restaurar los dos archivos de backend (`auth.js`, `ticketsSelf.js`) desde la imagen anterior; los tickets reales creados mediante el contrato siguen siendo válidos y no deben borrarse. |
| Transversal. Nombre MRTI-Tickets | Completa | 2026-08-28 | Core `3fc09c8`; Tickets `acb2eda`. Se uniformó la experiencia de mesa de servicio como **MRTI-Tickets** en catálogo, navegación, tablero, bandeja, alta, autoservicio y mensajes de API; se conservaron las solicitudes de vacaciones de RH y las categorías de negocio con nombre propio. Las migraciones idempotentes `008_rename_tickets_application.sql` y `009_hyphenate_tickets_application.sql` actualizaron el registro existente; una segunda ejecución dejó todo al día. Pruebas: Tickets backend 12/12, frontend 2/2 y Core 26/26; los tres builds pasaron y `git diff --check` quedó limpio. Smoke publicado: Core y Tickets 200, bundles con “Nuevo ticket”/“Cargando tickets”, APIs sin sesión 401 y catálogo persistido con nombre, descripción y característica `Tickets`. Contenedores de Tickets online. Rollback: revertir ambos commits, reconstruir Core/Tickets y ejecutar una migración compensatoria sólo si se desea restaurar el nombre anterior en el catálogo. |
| Transversal. Nombres visibles sin guion y MRTI Monitor | Completa | 2026-08-28 | Core `c0fcbc9`; Obs/Monitor `2d54110`; Activos `910cea9`; Tickets `4be050a`. Los nombres de presentación usan espacios: **MRTI Monitor**, **MRTI Tickets**, **MRTI Agent Core**, **MRTI Activos** y **MRTI RH**. Los identificadores compatibles permanecen técnicos y con guion donde ya aplica (`mrti-obs`, `agent-core`, `mrti-core`, `mrti-tickets`); no se cambiaron URLs, permisos ni servicios. La migración idempotente `010_normalize_module_display_names.sql` se aplicó y su segunda ejecución dejó el esquema al día. Evidencia: Core 26/26, Monitor 12/12 + typecheck, Activos 7/7 y Tickets 14/14; cuatro builds y `git diff --check` correctos. Smoke publicado 200 en Core, `/mrti-obs/`, Activos y Tickets; bundles con los nombres nuevos, catálogo persistido con `mrti-obs` → `MRTI Monitor`, APIs protegidas 401 y contenedores Tickets online. No se reiniciaron procesos PM2 con cambios locales ajenos. Rollback: revertir los cuatro commits, reconstruir los frontends y añadir una migración compensatoria para los nombres del catálogo; los códigos y rutas no requieren reversión. |
| Transversal. Navegación global y Mi espacio | Completa | 2026-08-28 | Core `c2f0afb`; Monitor `39bca09`; Activos `aa02015`; RH `a50b522`; Tickets `559215c`; Agent `b0f1dec`. Cada módulo consulta el catálogo autorizado de Core y ofrece enlaces directos a **Mi espacio** y a los demás módulos permitidos; Agent Core conserva el traspaso de sesión por fragmento. Core funciona como dashboard personal con perfil, foto privada, cambio de contraseña, tema, densidad y visibilidad de widgets. Migraciones aditivas `011_user_workspace_preferences.sql` y `012_user_profile_avatars.sql` ejecutadas dos veces; la foto se guarda como binario separado y sólo se sirve con sesión. Core 30/30, Tickets frontend 2/2, Go `go test ./...`, typecheck Monitor y seis builds correctos; `git diff --check` limpio. Smoke publicado 200 en los seis frontends, preferencia sin sesión 401, PM2 Core y Agent activos y contenedores Tickets online. Rollback: revertir el commit de cada módulo, reconstruir sus frontends, reiniciar Core/Agent y conservar las tablas aditivas sin uso; el binario previo del Agent quedó en `bin/mrti-monitor.bak-workspace-20260828`. |
| Transversal. Codificación de prioridad crítica | Completa | 2026-08-28 | Tickets `b9f5b4b`. La prioridad P1 contenía UTF-8 interpretado dos veces (`CrÃ­tica`, bytes `4372C383C2AD74696361`). La migración idempotente `007_fix_priority_name_encoding.sql` asigna el literal mediante bytes UTF-8 independientes de la codificación de la conexión; se ejecutó dos veces y el valor publicado quedó `Crítica` (`4372C3AD74696361`). Backend Tickets 12/12 y `git diff --check` limpio. Rollback: restaurar el valor anterior únicamente si se desea reproducir el defecto; no requiere reconstruir ni reiniciar servicios. |
| Transversal. Perfil del solicitante y límites de creación de Tickets | Completa | 2026-08-31 | Core `72f0bb1`; Tickets `205579e`. **Mi perfil** conserva editable el nombre, pero el correo queda de sólo lectura y el backend rechaza cambios propios con `EMAIL_ADMIN_ONLY`; el administrador puede corregirlo desde Centro de control, incluso para su propia cuenta. El detalle operativo muestra la identidad capturada al crear el ticket (nombre, correo, número, ubicación y equipo). Tickets conserva políticas por UUID sin FK cruzada: máximo por hora, máximo en ventana móvil de 24 horas o bloqueo total, aplicadas tanto al autoservicio como a la ruta operativa bajo un candado por usuario. La migración aditiva `008_ticket_user_creation_limits.sql` se ejecutó dos veces: tabla e índice únicos. Pruebas: Core 37/37, Tickets backend 19/19 y frontend 2/2; tres builds y `git diff --check` correctos. Smoke publicado: Core/Tickets/health 200, ruta de políticas sin sesión 401 y cuentas desechables confirmaron configuración administrativa 200 y alta bloqueada 403 `TICKET_CREATION_BLOCKED`; quedaron 0 políticas y 0 tickets de prueba. PM2 Core y contenedores Tickets online. Rollback: revertir ambos commits, reconstruir Core/Tickets y reiniciar sus servicios; la tabla aditiva puede permanecer sin uso. |
| Nuevo módulo. Alta de MRTI Legal | Completa — módulo publicado con cargas reales bloqueadas hasta implementar cifrado | 2026-08-31 | Legal `f4f1e5b` (repositorio nuevo `MRTI-Legal/`); Core `ad4a4f3` y documentación `877b7d2`. Módulo de expedientes legales y documentación jurídica confidencial: expediente con clave `LEG-000001`, tipo, estado, área y fechas; documentos con versionado inmutable (SHA-256, MIME real por firma binaria, nunca sobrescribe); confidencialidad interno/confidencial/restringido/privilegiado con autorización explícita adicional para los dos últimos niveles; permisos locales por expediente (`admin_legal`/`responsable`/`editor`/`consulta`/`auditor`) validados en backend; retención configurable, bloqueo legal y auditoría local. Sin llaves foráneas hacia otras bases; usuarios por UUID de Core. Publicación: `mrti_legal` creada con privilegios exclusivos de `mrtops`; migraciones `001`–`004` ejecutadas dos veces y 9 tablas estables; catálogo `mrti-legal` activo; `mrti-legal-api` online en PM2; Nginx publica `/legal-api/` y `/mrti-legal/`. Evidencia final: Legal 10/10, Core 37/37 y build Legal correctos; frontend y health públicos 200, API sin sesión 401; cuenta administradora desechable obtuvo catálogo 200, permiso 204, dashboard 200 y expedientes 200, después quedó 0 fixtures, 0 expedientes y 0 roles artificiales. Los administradores globales equivalen a `admin_legal`; asignar `responsable` a una cuenta real queda como decisión operativa, no requisito técnico. `LEGAL_ALLOW_REAL_DOCUMENTS=false` continúa activo: cifrado en reposo, antivirus y respaldos cifrados siguen pendientes antes de almacenar documentos reales. Rollback: detener/eliminar PM2, restaurar `/etc/nginx/sites-available/it-infra.bak-legal-20260831`, desactivar el catálogo y conservar la base aditiva sin borrar información. |

| MRTI Legal. Habilitación de carga para pruebas internas | Completa | 2026-08-31 | Por decisión del administrador se cambió únicamente la configuración publicada a `LEGAL_ALLOW_REAL_DOCUMENTS=true`; la instalación predeterminada continúa cerrada. Se conservaron autenticación, autorización, MIME por firma, límite de 25 MB, nombres físicos aleatorios, permisos `0600`, versionado, hash y auditoría. Smoke real sin `fixture`: expediente 201, carga PDF 201, descarga 200 y SHA-256 idéntico; usuario, expediente, archivo y auditoría temporal retirados, con 0 residuos. El almacenamiento permanece en el volumen raíz de 100 GB (45 GB libres); el disco físico de 894 GB conserva aproximadamente 791 GB sin asignar en LVM y no se expandió. Cifrado, antivirus y respaldo siguen como mejoras recomendadas antes de ampliar sensibilidad o usuarios. Rollback operativo: fijar `LEGAL_ALLOW_REAL_DOCUMENTS=false` y reiniciar `mrti-legal-api`; no afecta documentos ya guardados. |
| Transversal. Documentos laborales en MRTI RH | Completa | 2026-08-31 | RH `bdbe4b0`; Core `ca21e80`. Nueva sección "Documentos laborales" en la ficha del empleado, propiedad exclusiva de RH (sin FK hacia Core/Legal): contrato individual, renovación, convenio modificatorio, cambio salarial, confidencialidad, cambio de puesto, resguardo, terminación e identificación laboral, con clave `LAB-000001`. Tablas `employee_labor_document_types/documents/versions/roles`, con prefijo `employee_labor_*` deliberado para no chocar con `employee_documents` (expediente genérico ya existente, sin tocar). Versionado inmutable con SHA-256 y MIME real por firma binaria (no Content-Type del navegador); solo PDF/JPG/JPEG/PNG, 25 MB; estatus vigente/próximo a vencer/vencido derivado en la consulta desde `expires_at`/`notice_days`, sin cron. Almacenamiento propio (`MRTI-RH/server/storage/employee-documents/`, configurable con `RH_EMPLOYEE_DOCUMENT_STORAGE_DIR`), nombre físico UUID puro. Permisos propios de esta función (`employee_labor_document_roles`: responsable/consulta, otorgados sólo por `administrator` global de Core) — RH no distinguía niveles internos antes de esto. Autoservicio `/api/rh-self/me/documents*` acotado siempre a `req.employee` derivado de `portal_user_id`, nunca de un parámetro del navegador; "Mis documentos laborales" en Mi espacio RH sólo muestra lo marcado visible para el empleado. Auditoría reutiliza `audit_events` existente de RH (ya era fuente registrada en Core); notificaciones nuevas (`fetchRhNotifications`) fusionadas en la campanilla global junto a Tickets y Legal, sin tabla de leído/no-leído, mismo patrón que las otras dos. Evidencia: migración `013` aplicada dos veces contra la base real sin cambios (10 tipos antes/después); 35/35 verificaciones de contrato end-to-end (401/403, rol responsable/consulta, `.exe` y > 25 MB rechazados, hash y versionado sin sobrescritura, archivado lógico, autoservicio acotado, documento no visible oculto, auditoría) contra el backend real con un empleado fixture desechable (`ZZZTEST-LABOR-999999`) y un doble de Core; fixtures, auditoría de prueba y archivos físicos eliminados, 0 residuos. Se encontró y corrigió un bug real de parseo booleano en formularios multipart (`'0'` es truthy en JS). Builds RH y Core correctos, Core 37/37 sin regresión. `mrti-rh-api` y `mrti-core-api` reiniciados en producción. Rollback: revertir ambos commits, reconstruir los dos frontends y reiniciar ambos procesos; las tablas `employee_labor_*` son aditivas y pueden permanecer sin afectar `employee_documents` ni el resto del módulo. |
| MRTI Legal. Eliminación definitiva de expedientes | Completa | 2026-08-31 | Legal `2986dfc`. Nueva `DELETE /cases/:id`, restringida a `admin_legal` (más estricto que archivar, que también admite `responsable`); exige que el expediente ya esté archivado (409 si no) y que no tenga bloqueo legal activo (409 si lo tiene). Se registra en `audit_events` el estado "antes" completo (expediente, documentos, versiones, permisos y accesos restringidos) antes de borrar cualquier fila; el borrado en base de datos ocurre en una transacción y los archivos físicos de cada versión se eliminan sólo después de que la transacción confirma, para no dejar huérfanos si algo falla. En el frontend, "Eliminar definitivamente" sólo aparece para `admin_legal` en expedientes archivados sin bloqueo legal y exige escribir la clave del expediente para confirmar. Build y reinicio de `mrti-legal-api` correctos. A solicitud explícita del usuario se eliminó en producción el expediente de prueba `LEG-000002` ("Legalidades"), siguiendo esta misma secuencia (archivar → auditar → borrar); `legal_cases` quedó en 0 filas y el rastro de auditoría conserva los tres eventos (`case.created`/`case.archived`/`case.deleted`). Sin migración. Rollback: revertir `2986dfc`, reconstruir el frontend y reiniciar `mrti-legal-api`; no hay forma de recuperar un expediente ya eliminado por esta vía, por ser intencionalmente irreversible. |

## 10. Registro de decisiones

No reabrir una decisión sin añadir una entrada nueva con motivo y consecuencias.

| Fecha | Decisión | Motivo | Consecuencia |
|---|---|---|---|
| 2026-08-05 | Mantener `MRTI Infra` como nombre | Es correcto para topología y monitoreo | Se extraerán identidad y permisos a Core |
| 2026-08-05 | Dashboard personal vive en Core | Evita dar acceso administrativo al trabajador | Los módulos deben ofrecer APIs `*-self` |
| 2026-08-05 | Vincular RH mediante UUID de Core | Evita confiar en `employee_id` del navegador | `employees.portal_user_id` es referencia lógica |
| 2026-08-06 | Separar proceso antes de mover datos | Reduce el radio de fallo y facilita rollback | Core puede leer temporalmente tablas antiguas |
| 2026-08-06 | Renombrar el servidor de telemetría de MRTI-Agent de "mrti-core" a "MRTI Monitor" (decisión de jroman) | Liberar el nombre "MRTI Core" para el backend de identidad de la Fase 1, sin ambigüedad con el servicio de telemetría ya en producción | `MRTI-Agent@8cb2064` renombra binario/servicio/docs en el repo. **Pendiente:** el host aún corre el `mrti-core.service`/binario viejo — el corte en vivo (detener el servicio actual, instalar `mrti-monitor.service`, actualizar cualquier referencia externa) es un paso de despliegue separado que requiere autorización explícita antes de ejecutarse. También se encontró y corrigió una API key real committeada en texto plano en `service/mrti-core.service`; sigue expuesta en el historial de git y debe rotarse |
| 2026-08-10 | El backend de Core en Fase 1 monta deliberadamente solo `/api/health` y `/api/auth/*`; no incluye `dbRouter`, `uploads`, `monitoring`, sockets, engine ni UPS (todo eso es específico de infraestructura/monitoreo y sigue viviendo en Infra) | El contrato a replicar en esta fase es exclusivamente identidad; añadir código de monitoreo aquí duplicaría propiedad de datos antes de tiempo | Core queda intencionalmente incompleto como espejo de Infra — no debe usarse para nada más que autenticación/perfiles hasta las fases correspondientes (3, 6) |
| 2026-08-10 | `JWT_SECRET`, `JWT_EXPIRES_IN` y credenciales MySQL de `server/.env` de Core se copiaron literalmente del `.env` real de Infra (no se generó un secreto nuevo) | La guía (§5) exige el mismo secreto/algoritmo/claims mientras existan consumidores validando contra Infra, para que los tokens sean intercambiables durante la transición | Confirmado con una prueba real: un token emitido por Core (login con cuenta real) fue aceptado por `GET /api/auth/me` en Infra devolviendo el mismo `profile.id`. Si se rota el `JWT_SECRET` en Infra, debe rotarse igual en Core el mismo día, o las sesiones existentes se invalidarán de forma inconsistente entre ambos procesos |
| 2026-08-10 | Fase 2 solo mueve el tráfico de **navegador** (mismo origen vía Nginx) hacia Core; Activos/RH/Agent siguen validando contra Infra directo por variable de entorno o URL hardcodeada | Esos consumidores nunca pasaron por Nginx — no había nada que cortar ahí sin además cambiar su configuración, que es explícitamente el alcance de la Fase 4 | Infra sigue recibiendo tráfico real de `module-access`/`me` de Activos, RH y Agent; no puede apagarse ni limpiarse (Fase 5) hasta que la Fase 4 actualice esos tres consumidores a `MRTI_CORE_URL` |
| 2026-08-10 | Antes de introducir `MRTI_CORE_URL` (identidad, Fase 4) se renombró `MRTI_CORE_URL`/`MRTI_CORE_API_KEY`/`MRTI_CORE_API_KEY_FILE` en `MRTI-Infra/server/src/mrti.js` a `MRTI_MONITOR_URL`/`MRTI_MONITOR_API_KEY`/`MRTI_MONITOR_API_KEY_FILE` | Ese archivo ya usaba el nombre `MRTI_CORE_URL` desde antes del rename de 2026-08-06, pero para algo distinto (el proxy de telemetría hacia el servidor Go, hoy "MRTI Monitor", puerto 8477) — se quedó fuera de aquel rename porque solo tocó el repo `MRTI-Agent` (binario/systemd), no los *consumidores* de ese nombre en otros repos. Sin este arreglo, el mismo nombre de variable significaría dos cosas distintas en el mismo workspace (identidad en RH/Activos/Tickets, telemetría en Infra), con alto riesgo de que alguien copie/pegue el valor equivocado | No reabre la decisión de 2026-08-06 (Agent sigue llamándose "MRTI Monitor"), solo termina de aplicarla en el archivo que quedó pendiente. `MRTI-Infra@97a00e3`. Conserva fallback a los nombres viejos con `console.warn`; el valor real en `server/.env` ya se renombró (`MRTI_MONITOR_API_KEY`), sin rotar la key todavía (pendiente de seguridad ya conocido, no relacionado con este cambio) |
| 2026-08-10 | Fase 3 se divide en dos sesiones: primero desacoplar a Core de las tablas de Infra (endpoints `/api/self/*` + reescribir `shared.js`/`accessControlRoutes.js`/`ticketContextRoutes.js`), y sólo después crear `mrti_core` y copiar datos (decisión de jroman, opción "separar primero, mudar después") | Al investigar se encontró que Core hacía SQL directo (lectura y escritura) contra `areas`/`floors`/`buildings`/`sites`/`devices` de Infra en 3 archivos; mover `user_profiles` de base sin resolver eso primero rompía login, el panel de administración de ubicación/equipo y `ticket-context` de inmediato. Intentar las dos cosas en una sola sesión acumulaba demasiado riesgo antes de verificar nada en producción | El prerrequisito ya se completó y se probó end-to-end esta misma sesión (`MRTI-Infra@16073b6`, `MRTI@1d63093`). Efecto colateral aceptado: `PATCH /users/:id/location` ya no es una transacción SQL atómica (el área vive en Core, el equipo en Infra); se compensa con un rollback manual del área si Infra rechaza el equipo, documentado en el código |
| 2026-08-10 | Para resolver el `LEFT JOIN areas` que hacía `findProfile` en cada request autenticado, se optó por una API de autoservicio nueva en Infra (`GET /api/self/physical-areas(/:id)`) en vez de (a) un JOIN entre bases en el mismo servidor MySQL o (b) quitarle a Core el dato de ubicación física por ahora — decisión de jroman | Un JOIN entre bases viola el principio #6 de esta guía ("sin llaves foráneas entre módulos") aunque MySQL lo soporte técnicamente en el mismo servidor; quitar el dato rompía `ticket-context`, que ya lo usa en producción (Tickets, migrado a Core en la Fase 4 de esta misma sesión) | El autoservicio corre en el camino crítico de cada login/`/me` (vía `authRequired`) — se le puso timeout de 3s y degradación a `null` para que Infra caída nunca tumbe una sesión, solo oculte temporalmente el dato de ubicación |
| 2026-08-11 | La copia de `mrti_infra`→`mrti_core` (Fase 3) no usó un mecanismo de doble escritura ni un modo de mantenimiento formal — solo se verificaron los conteos justo antes de copiar y se copió de inmediato en una transacción | Con 3 usuarios/2 áreas/3 asignaciones reales, construir doble escritura era sobre-ingeniería para el riesgo real; el principio #8 exige "nunca copiar mientras se aceptan escrituras no replicadas", que se cumplió verificando en vez de bloqueando | Si la plataforma crece de escala, este mismo procedimiento manual dejaría de ser suficiente y sí habría que construir la ventana de solo lectura o doble escritura que este checklist original describía |
| 2026-08-11 | Las 8 FKs de tablas de Infra hacia `user_profiles.id` no se tocaron al mover la tabla a `mrti_core` — se dejaron resolviendo contra la copia congelada que quedó en `mrti_infra.user_profiles` | Los UUID son idénticos entre la copia congelada y la tabla real en `mrti_core` (se copiaron literalmente, no se regeneraron), así que esas FKs siguen siendo válidas mientras Infra no cree usuarios por su cuenta — y no puede, no tiene rutas de escritura de identidad montadas | Deuda documentada, no bloqueo: si en el futuro se borra un usuario en `mrti_core`, la fila equivalente en la copia congelada de `mrti_infra` NO se borra sola (son bases distintas) y esas 8 FKs seguirán apuntando a un id que ya no existe en el sistema real de identidad — hay que recordar borrar manualmente o resolver esto en la Fase 5 |
| 2026-08-11 | Se corrigió de inmediato (el mismo día, sin esperar a la Fase 5 formal) que `authRequired`/`socket.js` de Infra siguieran resolviendo `req.user` con SQL local contra la copia congelada de identidad | No era deuda técnica esperando su turno: era una regresión activa de la Fase 3 — cualquier usuario creado en Core después del corte de ayer no podía usar ninguna ruta real de Infra, y los cambios de rol/baja hechos en Core no se reflejaban ahí (riesgo de permisos desactualizados) | `MRTI-Infra@bed41ff`. Se dejó **sin tocar** el router `/api/auth` propio de Infra (login/administración de usuarios) y su `findProfile`/`signToken` locales — siguen siendo el respaldo de rollback de la Fase 4; desmontarlos es la Fase 5 real, pendiente de un período observado de tráfico cero |
| 2026-08-11 | Se quitó el fallback a `MRTI_CORE_URL`/`MRTI_CORE_API_KEY*` en `mrti.js` (el proxy de telemetría a Monitor), dejando sólo `MRTI_MONITOR_*` | Al agregar `MRTI_CORE_URL` en el `.env` de Infra para la corrección de arriba, ese fallback (heredado del rename de la Fase 4) habría hecho que el proxy de Monitor apuntara por error al puerto de Core — se detectó por logs de error (`SyntaxError` al parsear HTML como JSON) segundos después de aplicar el cambio, ventana real de exposición menor a dos minutos | Mismo commit `MRTI-Infra@bed41ff`. `MRTI_MONITOR_API_KEY` ya estaba fijada en el `.env` real desde el rename de ayer, así que quitar el fallback no requirió ningún otro cambio de configuración |
| 2026-08-11 | Notificaciones consolidadas (Fase 7) sin tabla ni estado de leído/no leído: se derivan al vuelo de `rh-self`/`tickets-self` en cada carga del dashboard — decisión explícita de jroman entre tres alcances propuestos | Con 3-4 usuarios reales, una bandeja de notificaciones persistente (tabla nueva + migración + endpoints de marcar-leído) era la opción de mayor esfuerzo para un beneficio que a esta escala no se nota; la guía solo exige "notificaciones consolidadas con enlaces", no un sistema de mensajería | Si la plataforma crece, esta v1 no distingue "ya lo vi" de "es nuevo" — solo muestra el estado actual cada vez; construir el estado persistente (segunda opción evaluada) sería el siguiente paso natural, no un rediseño |
| 2026-08-12 | Renombrar funcionalmente MRTI Infra a **MRTI-Obs** y trasladar todo inventario/asignación patrimonial a MRTI Activos (decisión explícita de jroman; reemplaza la decisión de nombre del 2026-08-05) | "Infra" mezclaba inventario, identidad, organización y observabilidad. MRTI-Obs expresa el dominio restante: topología, red, disponibilidad, métricas y alertas | El permiso canónico es `mrti-obs`; `mrti-infra` permanece como alias. El proceso PM2 ya se llama `mrti-obs-api`; el directorio y base `MRTI-Infra`/`mrti_infra` se conservan por rollback. Inventario y asignaciones sólo se escriben en Activos. La ruta canónica `/mrti-obs/` está activa y `/mrti-infra/*` redirige durante compatibilidad |
| 2026-08-12 | Preparar el acceso futuro a la base externa con una cuenta exclusiva de lectura y ejecutar primero sólo verificación de permisos y catálogo | El repositorio no conserva el importador original ni el esquema de la fuente; asumir tablas o copiar todo mezclaría dominios y podría extraer secretos | `MRTI-Activos@1d83670` incorpora `source:check` y `source:catalog`; el primer acceso no descarga filas. El mapeo, respaldo e importación idempotente se harán en una fase posterior, con autorización, después de clasificar cada tabla por módulo propietario |
| 2026-08-12 | No completar automáticamente la jerarquía de Sitios a partir de nombres de dispositivos o supuestos | Sitio, edificio, piso y área física son datos maestros de MRTI-Obs; una inferencia incorrecta afectaría Activos, Core, RH, mapas y monitoreo | La pantalla informa jerarquías vacías y errores reales. Los 7 sitios sin edificio y el edificio sin pisos permanecen pendientes hasta recibir información física confirmada |
| 2026-08-12 | Dejar la canonicalización de `/mrti-infra/*` exclusivamente en Nginx y montar siempre React en el entrypoint | `import.meta.env.BASE_URL` vale `./` en el build compatible; no es un prefijo de pathname y usarlo como tal causó una recarga infinita | `MRTI-Infra@cee63ef` elimina el redirect duplicado del cliente. Nginx mantiene el 301 preservando rutas profundas y `BrowserRouter` usa `/mrti-obs/` como base canónica |
| 2026-08-12 | Evolucionar Core por etapas hacia portal empresarial, reutilizando los contratos actuales y sin inventar datos corporativos | El prompt objetivo incluye catálogo dinámico, anuncios, aprobaciones, auditoría y personalización, pero implementarlos juntos mezclaría propietarios, requeriría nuevos contratos y elevaría el riesgo. Tampoco existe un archivo de marca oficial en el workspace | `MRTI@8a64f92` entrega primero login, contexto personal, resumen y acciones rápidas con datos reales ya autorizados. `public/company-logo.svg` es un emblema interno reemplazable, no el logotipo legal definitivo. Las tablas y rutas futuras están propuestas en `CORE_PORTAL_EVOLUTION_PLAN.md` y deberán añadirse mediante migraciones idempotentes, con compatibilidad y pruebas por fase |
| 2026-08-12 | El catálogo de aplicaciones y su auditoría pertenecen a Core; los códigos se amplían desde `applications` conservando `access_area_modules` como relación compatible | Las tarjetas hardcodeadas impedían configurar nuevas aplicaciones y el control administrativo no dejaba trazabilidad. Crear un RBAC paralelo completo en esta etapa habría duplicado permisos antes de migrarlos | `MRTI@3e3a9be` añade administración dinámica y eventos de auditoría. No se borran aplicaciones: se desactivan; los códigos existentes y `mrti-infra` como alias siguen válidos. Nginx sólo entrega `/api/portal/*` a Core y conserva el resto de `/api/*` en MRTI-Obs |
| 2026-08-24 | Core define el contrato visual transversal; cada frontend conserva una copia local de sus tokens y todos comparten `mrti_theme`, sidebar de 256/64 px y drawer móvil | La dependencia de ejecución entre frontends impediría desplegar o revertir módulos de forma independiente, mientras que paletas, navegación y controles divergentes hacían que la plataforma pareciera una colección de sistemas distintos | `PORTAL_VISUAL_SYSTEM.md` documenta tokens, accesibilidad y verificación. La expansión se aplicó por repositorio sin cambiar rutas, permisos ni propiedad de datos. La pantalla de pared de MRTI-Obs mantiene su shell especializado, y cada módulo puede revertir su commit visual y reconstruirse aisladamente |
| 2026-08-25 | Core es el único propietario del catálogo de recursos de marca; guarda metadatos y binarios en `mrti_core.brand_assets`, permite lectura autenticada y restringe altas y bajas al rol global `administrator` | Mantener imágenes y catálogo dentro del código obligaba a editar y desplegar el frontend por cada cambio, y ocultar controles sólo en la interfaz no protegía la operación | `MRTI@7b277ff` reemplaza el arreglo estático por API y carga mediante arrastrar y soltar. Quitar archiva lógicamente para conservar auditoría y recuperación; SVG se valida y bloquea contenido activo, y PNG/JPG/WebP se verifican por firma. El recurso estático anterior permanece temporalmente como rollback, pero no alimenta la vista normal |
| 2026-08-25 | Modelar logo del portal y fondo del login como ranuras extensibles de apariencia que referencian `brand_assets`, con lectura pública limitada a la imagen asignada y escritura sólo administrativa | El login necesita obtener su fondo antes de que exista una sesión, mientras que publicar el catálogo entero expondría archivos que no tienen por qué ser anónimos. Copiar binarios para cada uso duplicaría almacenamiento y dificultaría cambios | `MRTI@fd71519` crea `brand_appearance`. Un recurso en uso no puede archivarse hasta reasignarlo o volver al predeterminado; las respuestas públicas no listan el catálogo y se revalidan para reflejar cambios sin rebuild. Las ranuras nuevas podrán añadirse posteriormente sin cambiar el modelo de archivos |
| 2026-08-28 | Toda prueba que use una ranura global de apariencia debe capturar y restaurar su estado previo exacto | Los contratos corren contra el servicio y base reales; restaurar siempre `NULL` confundía el mantenimiento con una pérdida causada por el reinicio y modificaba configuración legítima del administrador | El fixture temporal puede comprobar asignación y retiro, pero al finalizar repone `asset_id`, autor y fecha originales. Un reinicio ordinario sólo relee la misma configuración persistida en MySQL |
| 2026-08-28 | Separar la lista de candidatos activos para un equipo de Tickets del permiso previo al módulo | El administrador necesita poder preparar el equipo con cualquier cuenta activa; filtrar primero por área con acceso generaba una dependencia circular y ocultaba 8 de 11 usuarios | Core ofrece todos los perfiles activos como candidatos. Tickets conserva la autorización efectiva: la membresía define el alcance por área y el acceso operativo al módulo continúa sujeto a sus controles existentes |
| 2026-08-28 | Derivar las novedades de equipo de tickets abiertos y sin responsable, sin crear por ahora una bandeja persistente de leído/no leído | El evento relevante para todo el equipo es la llegada de trabajo aún no tomado; mantenerlo después de asignarlo duplicaría la alerta individual del responsable | `tickets-self/team-notifications` usa la membresía local por área y nunca entrega otras colas. Core combina esa fuente con RH y tickets propios; al resolverse o asignarse el ticket deja de aparecer como novedad grupal |
| 2026-08-28 | Administrar las membresías de Tickets desde el Centro de control de Core sin mover su tabla ni autoridad | El administrador pidió una entrada central y la duplicación de datos entre Core y Tickets rompería la frontera de propiedad existente | Core sólo presenta y orquesta las APIs protegidas de Tickets. `business_area_members`, su auditoría y las validaciones de asignación permanecen en la base y backend de Tickets |
| 2026-08-24 | Descubrir automáticamente todas las bases accesibles con estructura de CONTPAQi Nóminas y modelar sitio/empresa como relación laboral, no como una segunda persona | La conexión anterior leía sólo `ctNominas_MRT`; en el mismo servidor había tres fuentes adicionales y los `idempleado` numéricos colisionan entre todas. Una lista fija volvería a omitir cualquier empresa futura | `MRTI-RH@1527edf` usa el nombre de base como clave estable salvo `MRT`, que conserva su alias para rollback. La conciliación de persona se hace por RFC/CURP y conserva N relaciones/sitios. Fuentes sin recibos recientes y con ejercicio antiguo se muestran históricas: se consultan, pero sus códigos A/R no inflan activos. Descubrimiento y empleados corren cada 2 h; historial pesado, diario; ambos tienen disparador manual. CONTPAQi permanece estrictamente de solo lectura |
| 2026-08-24 | Para vincular las relaciones CONTPAQi con la ficha RH, CURP es la identidad primaria y RFC sólo el respaldo cuando no existe coincidencia por CURP | Se verificó una relación con CURP correcto pero RFC perteneciente a otra persona; priorizar RFC habría unido dos personas distintas y explicaba el conteo incorrecto de 1,968 | `MRTI-RH@b113377` crea `employee_contpaq_links`, vincula las 5,004 relaciones a 1,963 personas y no sobrescribe CURP/RFC durante la propagación de campos laborales. La sincronización periódica y manual reconcilia la ficha central; una fuente inconsistente queda aislada sin modificar CONTPAQi |
| 2026-08-24 | Proyectar la plantilla vigente de CONTPAQi al Diseño organizacional por empresa/sitio y departamento, conservando como autoritativa cualquier configuración manual existente | Diseño organizacional era un catálogo aislado con sólo los 54 puestos de MRT, aunque la ficha central ya tenía 311 personas activas. Inventar jefes habría falseado la estructura y reemplazar los puestos existentes habría perdido 41 relaciones capturadas | `MRTI-RH@1f67215` reutiliza los 54 puestos manuales, genera únicamente los 257 faltantes y mantiene vínculos separados para actualizar altas, bajas, cambios de puesto y departamento cada dos horas o bajo demanda. Las personas sin jefe quedan explícitamente sin relación hasta que RH la configure; CONTPAQi aporta sitio/departamento/puesto/ocupante, no una jerarquía inexistente |
| 2026-08-24 | Identificar cada puesto con `position_code` único, editable y estable; el id numérico queda interno y el nombre continúa siendo descriptivo | Los nombres se repiten y cambian, por lo que no son referencias seguras para relaciones, reportes o integraciones. El alcance del puesto tampoco cabía adecuadamente en la descripción corta existente | `MRTI-RH@aa9f439` asigna claves `PST-000001`… a los 311 puestos y admite claves corporativas de 2–50 caracteres. La descripción pasa a `TEXT`, se edita y consulta desde Diseño organizacional, y ni clave ni descripción se sobrescriben desde CONTPAQi. La API ofrece búsqueda y consulta directa por clave; el índice único evita referencias ambiguas |
| 2026-08-25 | Visualizar la jefatura como árbol general de ramas variables, no imponer un árbol binario estricto de máximo dos subordinados | Una jerarquía corporativa puede tener cualquier cantidad de reportes directos; limitarla artificialmente a dos alteraría la relación real. El problema era de distribución visual y navegación, no del modelo de datos | `MRTI-RH@36fdc1f` usa un layout descendente ortogonal y progresivo: abre sólo ramas solicitadas, conserva texto legible y muestra el puesto antes que el ocupante. El backend mantiene un único jefe directo vigente por puesto, impide ciclos y admite N subordinados por jefe. La captura se hace por búsqueda contextual en vez de un `select` masivo |
| 2026-08-25 | Resolver la relación CONTPAQi en la página de perfil a partir de la ficha RH, sin exigir que cada pantalla de origen transporte ambos identificadores | Dashboard y organigramas conocen legítimamente el ID central de RH, mientras que obligar a todos los enlaces presentes y futuros a conocer también el ID interno del espejo duplicaría lógica y volvería a producir perfiles parciales | `MRTI-RH@ea5a241` conserva compatibilidad con enlaces que ya incluyen `contpaq`, pero usa `employees.contpaq_mirror_id` como respaldo canónico. Las personas sin vínculo continúan mostrando una ficha exclusivamente RH y CONTPAQi sigue siendo de solo lectura |
| 2026-08-26 | El filtro del directorio por sitio proyecta una relación laboral específica; la vista sin sitio continúa siendo la identidad consolidada de la persona | Filtrar sólo por pertenencia y conservar el estado global permitía que una baja histórica de un sitio apareciera activa por su empleo vigente en otro, además de mostrar puesto y departamento ajenos al sitio elegido | `MRTI-RH@18b5bbb` calcula estado y campos laborales desde la fuente seleccionada, actualiza los conteos de las pestañas al mismo alcance y conserva “Sitio: todos” como vista completa |
| 2026-08-26 | Ofrecer la visualización completa del contexto como modalidad explícita, sin eliminar el recorte seguro de las vistas cómoda y compacta | Dibujar sólo 3 o 4 elementos protegía legibilidad y rendimiento, pero impedía revisar de un vistazo unidades medianas como Oficinas Administrativas (29 elementos). Hacer que todas las vistas cargaran cientos de nodos por defecto reintroduciría el problema de escala que motivó el recorte | `MRTI-RH@ef72c63` añade un modo completo bajo demanda que expande todo, compacta tarjetas y amplía el rango de zoom; la selección se conserva en la sesión y la vista inicial sigue siendo cómoda |
| 2026-08-26 | El árbol de toda la empresa usa exclusivamente relaciones `jefe_directo` capturadas; una unidad acotada puede mostrar como ancla sólo al jefe inmediato que está fuera de su alcance | Agrupar puestos por unidad mediante líneas artificiales confundiría pertenencia organizacional con reporte. Incluir la cadena completa del jefe externo también contaminaría la lectura local solicitada | `MRTI-RH@0e788a9` muestra las 316 posiciones como un bosque fiel a las 42 relaciones vigentes. El ancla externa es opcional, se distingue visualmente y realiza un solo salto; cuando no existe relación directa, no se dibuja nada |
| 2026-08-26 | Usar tarjetas verticales y angostas en el lienzo del organigrama, con avatar centrado sobre el texto | La disposición horizontal avatar-texto consumía demasiado ancho por persona y extendía las ramas laterales fuera del espacio visible, especialmente en la vista completa | `MRTI-RH@4c5fe1b` reduce 27 % el ancho medido del árbol completo; nombre y puesto pueden ocupar dos líneas y el costo se traslada deliberadamente a altura, navegable con el zoom y desplazamiento existentes |
| 2026-08-26 | Mantener la auditoría en la base propietaria de cada módulo y consolidarla en Core únicamente para lectura administrativa | Centralizar cada escritura haría que una caída de Core bloqueara operaciones de RH, Activos, Tickets u Obs y duplicaría la propiedad de datos; compartir una base o usar llaves foráneas cruzadas rompería los límites de la arquitectura | Cada módulo captura localmente y expone un contrato protegido; Core reenvía la sesión, consulta en paralelo y tolera fuentes caídas. El historial unificado es eventual y puede quedar parcial, condición que se muestra explícitamente en la interfaz |
| 2026-08-26 | Admitir fuentes CONTPAQi sin `Vista_Empleados` únicamente cuando contienen el conjunto completo y conocido de tablas base y catálogos | MINERA CUITABOCA usa el mismo modelo de Nóminas, pero no trae la vista auxiliar instalada en las otras cuatro empresas; exigirla ocultaba una fuente vigente de 2026. Aceptar cualquier tabla parcial habría arriesgado perfiles incompletos o uniones ambiguas | Las fuentes modernas conservan la consulta existente. Para el esquema heredado, RH proyecta explícitamente empleados, puesto, departamento, turno, periodo, registro patronal y CURP mediante `SELECT`; si falta cualquiera de las tablas requeridas, la fuente sigue rechazándose. CONTPAQi permanece estrictamente de sólo lectura |
| 2026-08-26 | Aprovisionar identidades de Core sólo desde correos corporativos activos y no ambiguos de RH; una cuenta nueva comienza como `viewer` sin área de acceso | Core debe seguir siendo el único propietario de credenciales y permisos, mientras RH es propietario del nombre laboral y del vínculo con la persona. Reutilizar un correo presente en varias fichas asignaría una sola identidad a personas distintas | La integración usa APIs autenticadas y UUID estables, sin SQL ni llaves foráneas entre bases. Los correos duplicados se reportan y no se vinculan. Cada contraseña temporal es aleatoria, se entrega una sola vez y obliga a definir una contraseña personal; no se usa una clave compartida. Asignar módulos después continúa siendo una acción administrativa explícita |
| 2026-08-27 | Reducir la longitud mínima de contraseña de 10 a 6 caracteres y mantener 128 como máximo | El administrador solicitó claves más breves para la operación interna; Core debe aplicar una sola política en backend y todas las pantallas deben coincidir para no bloquear claves válidas antes de enviarlas | `MRTI@3fce519` es la autoridad efectiva y Obs conserva la misma regla sólo para compatibilidad/rollback. No se modifican hashes existentes ni se fuerzan cambios. La reducción facilita claves más débiles, por lo que siguen recomendándose frases más largas y las cuentas aprovisionadas conservan cambio obligatorio inicial |
| 2026-08-27 | Separar `requireCoreAuth` de `requireAuth` en Tickets y limitar el primero a rutas de autoservicio | Exigir permiso al módulo para levantar un ticket convertía una gestión básica en acceso innecesario a colas, asignaciones, SLA y administración. Quitar la validación global sin una segunda frontera habría expuesto esas operaciones | El token siempre se valida en Core. `requireCoreAuth` permite opciones, alta y consulta propia; `requireAuth` añade la exigencia del módulo para toda la interfaz operativa. El navegador no envía `requester_id`: Tickets lo deriva del UUID autenticado, conserva la propiedad del ticket y registra su auditoría local |
| 2026-08-27 | Autorizar la operación de Tickets con la intersección entre acceso al módulo en Core y membresía de área en Tickets; el administrador global conserva alcance completo | El permiso de aplicación responde quién puede entrar, pero no qué cola empresarial puede atender. Usar solamente la categoría para seguridad permitiría que una reclasificación futura cambiara el propietario histórico del ticket | Core sigue siendo propietario de usuarios, roles y módulos. Tickets guarda únicamente el UUID estable en `business_area_members` y el área destinataria en cada ticket, sin FK cruzada. Un usuario operativo ve la unión de sus áreas y nunca tickets de otras; un área vacía queda accesible sólo al administrador hasta configurarla. El solicitante conserva consulta propia mediante el contrato de autoservicio, sin acceder a la operación interna |
| 2026-08-28 | Usar **MRTI-Tickets** como nombre canónico y reservar “solicitud” para dominios ajenos o categorías específicas | La interfaz mezclaba “Solicitudes” y “Tickets” para el mismo objeto, mientras RH también usa solicitudes con significado propio | El código y nombre visible usan MRTI-Tickets y ticket/tickets; los identificadores técnicos y rutas compatibles (`tickets`, `/tickets/`, `requests-stat`) no cambian. RH y categorías como “Solicitud de compra” conservan su terminología de dominio |
| 2026-08-28 | Separar nombres de presentación sin guion de identificadores técnicos compatibles y presentar MRTI-Obs como **MRTI Monitor** | El usuario pidió una nomenclatura visual natural sin trasladar espacios a nombres internos; renombrar códigos y rutas existentes habría roto permisos, marcadores e integraciones sin aportar valor visible | La interfaz y el catálogo muestran nombres con espacios. Se conserva `mrti-obs` como código y `/mrti-obs/` como ruta; los demás códigos, paquetes, servicios y carpetas mantienen sus nombres técnicos con guion. Esta decisión reemplaza únicamente la presentación definida en la entrada anterior, no la terminología ticket/tickets |
| 2026-08-28 | Hacer que todos los módulos naveguen mediante el catálogo autorizado de Core y convertir Core en **Mi espacio** personalizable | Los enlaces locales duplicados se desactualizan y obligaban a volver a Core para cambiar de aplicación; Core ya es propietario de identidad, permisos y contratos de autoservicio | Monitor, Activos, RH, Tickets y Agent consultan `/api/portal/v1/applications` y sólo muestran destinos permitidos. Core concentra perfil, foto privada, contraseña y preferencias por usuario; cada módulo continúa siendo desplegable y reversible de forma independiente |
| 2026-08-28 | Escribir la etiqueta **Crítica** mediante su representación UTF-8 hexadecimal en la migración correctiva | El cliente usado al aplicar una migración anterior reinterpretó el literal acentuado y almacenó mojibake aunque el archivo fuente era correcto | La corrección es idempotente e independiente del juego de caracteres de la conexión; las interfaces siguen leyendo el nombre desde Tickets sin excepciones ni reemplazos en frontend |
| 2026-08-30 | Separar los tokens de color por función visual y exigir una auditoría autenticada en ambos temas | Un mismo dorado o verde puede funcionar como fondo decorativo y fallar como texto pequeño; revisar sólo la hoja CSS tampoco detecta superficies compuestas ni estados que aparecen con datos reales | Cada módulo conserva su paleta y despliegue independiente, pero distingue acento decorativo, acento textual y color sólido de estado. La verificación recorre rutas reales con sesión temporal, calcula contraste según WCAG y elimina el fixture al terminar; el criterio de cierre es cero combinaciones visibles por debajo de 4.5:1 para texto normal o 3:1 para texto grande |
| 2026-08-30 | Centralizar las nuevas vacaciones, permisos y gestiones equivalentes en Tickets; Core sólo presenta información laboral de consulta | Mantener un formulario RH y otro flujo en Tickets generaba dos bandejas, dos estados y una experiencia redundante para el usuario | Core deja de escribir o cancelar `leave-requests` y deja de derivar notificaciones de ese origen. Los saldos históricos permanecen visibles porque pertenecen a RH y son informativos; toda nueva gestión entra por el autoservicio de Tickets, que conserva clasificación, seguimiento y notificaciones en un solo flujo |
| 2026-08-30 | Tratar las notificaciones como una utilidad global de la barra superior y no como contenido configurable del dashboard | Las novedades deben estar disponibles sin desplazar la información de trabajo ni obligar al usuario a volver a Inicio; mostrarlas también como tarjeta y estadística duplicaba la misma señal | `shellMarkup` incorpora una sola campanilla y un panel reutilizable en Inicio, Perfil, Centro de control y demás pantallas. La consulta y el refresco se enlazan al shell, el contador se muestra sobre la campana y el dashboard queda reservado para información y gestiones personales |
| 2026-08-30 | Publicar las novedades derivadas mediante Core y presentar una campanilla local en cada módulo | Consultar directamente varias APIs desde cada frontend duplicaba filtros y dejaba a Agent sujeto a rutas y CORS particulares; enlazar de vuelta a Core interrumpía el trabajo actual | Core autentica una vez y consolida las fuentes de Tickets en `/api/portal/v1/notifications`, con degradación parcial y enlaces según permisos. Cada módulo conserva su shell y despliegue independiente, pero consume el mismo contrato y refresca en segundo plano. Monitor agrega esta fuente a sus alertas propias; esta versión continúa derivada del estado actual y no introduce leído/no leído persistente |
| 2026-08-31 | Permitir sólo al creador corregir título y descripción durante 10 minutos, manteniendo el detalle de autoservicio dentro de Core | El usuario necesita revisar lo reportado y corregir errores inmediatos, pero una edición abierta indefinidamente alteraría el registro que el equipo ya está atendiendo; exigir el módulo operativo ampliaría permisos innecesariamente | `tickets-self` sigue validando sólo la identidad de Core para consulta propia. El detalle admite creador o asignado, pero el `PATCH` exige `requester_id`, calcula `editable_until` y repite el límite en la escritura SQL para cerrar carreras al vencer el plazo. Core no expone acciones de cola, asignación, SLA o administración ni enlaza al módulo desde **Mis tickets** |
| 2026-08-31 | Mantener en Tickets las políticas de creación y administrarlas desde el Centro de control de Core | Core es propietario del usuario y su correo, pero Tickets es propietario de las altas, conteos y reglas contra abuso; copiar tickets o políticas a Core duplicaría autoridad | Core presenta usuarios activos y orquesta una API exclusiva para administradores. Tickets guarda el UUID estable sin FK, cuenta todas las altas del usuario en ventanas móviles y serializa intentos simultáneos; el correo propio nunca se modifica desde **Mi perfil** y sólo una operación administrativa de Core puede corregirlo |
| 2026-08-31 | Publicar MRTI Legal con metadatos operativos pero mantener bloqueada toda carga documental real | La base, autenticación, permisos y auditoría pueden verificarse sin exponer documentos; habilitar archivos antes de contar con cifrado en reposo, antivirus y respaldos cifrados contradiría el modelo de riesgo definido | `LEGAL_ALLOW_REAL_DOCUMENTS=false` permanece en la configuración de producción. Los administradores globales pueden preparar expedientes y equivalen a `admin_legal`, pero ninguna carga real se habilitará hasta implementar y probar gestión de llaves, escaneo y restauración |

| 2026-08-31 | Habilitar temporalmente cargas reales de MRTI Legal para una operación interna de una sola persona, sin asignar todo el disco disponible | El administrador priorizó comenzar pruebas con archivos escaneados de origen controlado y aceptó posponer cifrado, antivirus y respaldos dedicados | Sólo cambia la bandera de ejecución; no se retiraron autenticación, permisos, validación, versionado, hash ni auditoría. Los archivos se almacenan sin cifrar y esa condición queda documentada. No se amplía el volumen LVM hasta medir crecimiento real; se conserva espacio sin asignar para expansión gradual y otros servicios |
| 2026-08-31 | Usar un mismo contrato de sidebar y header `sticky` sin convertir los frontends en un monolito | El usuario necesita sentir una sola plataforma al cambiar de módulo, pero cada dominio debe conservar despliegue, rutas, alertas y acciones propias | Cada frontend implementa localmente las mismas medidas, superficies, navegación global, campanilla y acceso al perfil. El header permanece en el flujo con `position: sticky; top: 0`, por lo que acompaña el desplazamiento sin superponer ni exigir compensaciones fijas; Monitor conserva búsqueda/alertas y cada sidebar conserva exclusivamente su navegación de dominio |
| 2026-09-01 | Usar la cabecera de marca del Core como contrato literal y reservar el regreso a Mi espacio al logotipo | Las copias locales mantenían medidas generales parecidas, pero divergían en fuente, peso, color y texto superior; además, el enlace “Volver al Core” repetía la acción ya disponible en el logo | Cada módulo conserva su nombre, pero comparte logo de 42 px, Big Shoulders Display para el título, IBM Plex Sans para “Minera Río Tinto” y 61 px de cabecera. Se retira únicamente la opción textual redundante; “Mi espacio” continúa disponible en el selector de módulos y en el logotipo |
| 2026-09-01 | Mostrar literalmente **MRTI / Minera Río Tinto** en la zona de marca de todos los módulos y dejar el nombre del producto sólo en el encabezado de contenido | Usar “MRTI Monitor”, “MRTI Activos” o “MRTI Agent Core” dentro de la marca seguía produciendo anchos, truncamientos y jerarquías diferentes; Agent además dependía de recursos del Core servidos desde otro origen | Esta entrada precisa la decisión anterior: la zona superior replica la marca del Core sin sustituir el título; todos usan el mismo padding, logo y tipografías. Agent incorpora copias exactas de los tres recursos de marca en su binario y sólo reemplaza el logo por una personalización remota después de que ésta cargue correctamente |
| 2026-09-02 | Mantener un espejo aplicativo local y versionado de los datos CONTPAQi que consume RH, con aprobación administrativa para desapariciones, en lugar de activar replicación nativa del SQL Server propietario | MRTI debe seguir operando con la última copia válida si el servidor remoto falla, sin elevar permisos ni crear objetos en una instalación CONTPAQi/SQL Server 2008 R2 ajena al módulo. Una consulta incompleta tampoco debe convertirse en una baja o eliminación falsa | RH sólo ejecuta `SELECT` contra la fuente, fotografía el esquema y aplica una instantánea completa local. Los registros ausentes quedan marcados, conservados y fuera de cálculos vigentes; el administrador elige conservar, archivar o eliminar la copia desde una bandeja auditada. Los estados anteriores permanecen versionados, las reapariciones se restauran automáticamente y la fecha visible representa únicamente la última sincronización exitosa |
| 2026-09-02 | Usar como número visible de RH el `codigoempleado` de CONTPAQi y distinguir las altas locales con `RH-####` hasta vincularlas | Mantener un consecutivo paralelo como `0001` para una persona `1978` generaba dos referencias para el mismo expediente. Hacer globalmente único el código CONTPAQi tampoco era correcto: el diagnóstico real confirmó que distintas empresas reutilizan algunos códigos, aunque no existen duplicados dentro de una misma empresa | La identidad de numeración es empresa+código; la ficha conserva su ID interno estable. Una conciliación verificada por CURP/RFC sustituye la clave temporal sin recrear relaciones y registra el valor anterior en historial. Los conflictos dentro de una misma empresa se conservan para revisión y nunca se resuelven silenciosamente. La integración continúa sin escrituras al servidor CONTPAQi |

## 11. Definición final de terminado

La iniciativa completa puede marcarse terminada únicamente cuando:

- Core tiene backend, base y despliegue propios.
- Core es el único emisor y administrador de identidad/permisos.
- MRTI-Obs no contiene handlers ni escrituras de autenticación.
- Activos es el único propietario de inventario patrimonial y asignaciones.
- MRTI-Obs conserva únicamente topología, monitoreo y referencias externas.
- RH, Activos, Tickets, MRTI-Obs y Agent usan `MRTI_CORE_URL`.
- Los contratos de autenticación y autoservicio están automatizados.
- El dashboard personal degrada widgets individualmente.
- No existen secretos, tablas antiguas o rutas de compatibilidad sin una fecha y
  responsable de retiro documentados.
- Todos los repositorios involucrados están limpios y sus commits están
  registrados en esta guía.
