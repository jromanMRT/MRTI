# Guía operativa de evolución MRTI Core / MRTI Infra

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
- **MRTI Infra** administra infraestructura técnica, topología, monitoreo,
  disponibilidad, mapas y alertas.
- **MRTI Activos** administra el ciclo de vida patrimonial y operativo de los
  activos, asignaciones, garantías, mantenimiento y licencias.
- **MRTI RH** administra la ficha laboral, organización, ausencias y expediente.
- **MRTI Tickets** administra solicitudes de servicio, SLA y seguimiento.
- **MRTI Agent** recolecta telemetría y ejecuta funciones autorizadas en equipos;
  no es propietario de usuarios ni de inventario patrimonial.

La migración está terminada cuando Infra ya no contiene autenticación ni control
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
7. **APIs de autoservicio separadas.** Un usuario autenticado puede consultar sus
   propios datos sin recibir permisos administrativos del módulo.
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
| Sitios, edificios, pisos, áreas físicas y planos | Infra | Core, RH, Activos | Infra es dueño de la topología |
| Monitores, estado de red, disponibilidad y alertas | Infra | Core, Agent | Infra almacena estado operacional |
| Telemetría cruda y ejecución en endpoint | Agent | Infra | Infra consume eventos; Agent no asigna activos |
| Activo, serie, compra, garantía y mantenimiento | Activos | Infra, Core, RH | Activos es el inventario maestro |
| Asignación patrimonial persona-activo | Activos | Core, RH, Tickets | Referencia `user_id` de Core |
| Ticket, SLA, comentarios y estado | Tickets | Core, módulos | Core solo muestra el resumen personal |
| Vacaciones, permisos, saldos y expediente | RH | Core | Core usa `/rh-self`; RH conserva administración |

### Diferencias que deben respetarse

- Un **departamento laboral** pertenece a RH.
- Un **área física** pertenece a Infra.
- Un **activo patrimonial** pertenece a Activos.
- Un **dispositivo monitoreado** pertenece a Infra y referencia, cuando aplique,
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

### Fase 6 — Frontera Infra / Activos

Objetivo: eliminar duplicidad de inventario y asignaciones.

Checklist:

- [ ] Inventariar columnas y endpoints equivalentes en ambos módulos.
- [ ] Clasificar cada campo como patrimonial, operacional o topológico.
- [ ] Designar en Activos un ID estable para el activo.
- [ ] Añadir en Infra una referencia opcional `asset_id` al dispositivo monitoreado.
- [ ] Mover asignación persona-activo y equipo habitual a Activos.
- [ ] Hacer que Core consulte el resumen mediante una API de autoservicio.
- [ ] Conciliar registros huérfanos, duplicados y dispositivos no patrimoniales.

Criterio de terminado:

- Solo Activos puede modificar asignaciones y datos patrimoniales.
- Solo Infra puede modificar estado de monitoreo y topología.

Rollback:

- Mantener lecturas del modelo anterior mediante adaptador durante compatibilidad.

### Fase 7 — Dashboard personal extensible

Objetivo: consolidar gestiones personales sin abrir módulos administrativos.

Checklist:

- [x] RH ofrece `/api/rh-self` con aislamiento por identidad.
- [x] Core muestra ficha, saldos y solicitudes de RH.
- [ ] Activos ofrece `/api/activos-self` para equipo y asignaciones propias.
- [ ] Tickets ofrece `/api/tickets-self` para tickets creados o asignados al usuario.
- [ ] Core maneja widgets caídos de forma independiente; un módulo no debe tumbar
      todo el dashboard.
- [ ] Añadir notificaciones consolidadas con enlaces a acciones permitidas.

Criterio de terminado:

- Un trabajador realiza gestiones personales desde Core y solo ve aplicaciones
  administrativas explícitamente asignadas.

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
| 6. Frontera Infra/Activos | Pendiente | — | — |
| 7. Dashboard personal extensible | En progreso | 2026-08-05 | Core `3d929ab`; RH `67455b5`; falta Activos/Tickets |

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

## 11. Definición final de terminado

La iniciativa completa puede marcarse terminada únicamente cuando:

- Core tiene backend, base y despliegue propios.
- Core es el único emisor y administrador de identidad/permisos.
- Infra no contiene handlers ni escrituras de autenticación.
- Activos es el único propietario de inventario patrimonial y asignaciones.
- Infra conserva únicamente topología, monitoreo y referencias externas.
- RH, Activos, Tickets, Infra y Agent usan `MRTI_CORE_URL`.
- Los contratos de autenticación y autoservicio están automatizados.
- El dashboard personal degrada widgets individualmente.
- No existen secretos, tablas antiguas o rutas de compatibilidad sin una fecha y
  responsable de retiro documentados.
- Todos los repositorios involucrados están limpios y sus commits están
  registrados en esta guía.

