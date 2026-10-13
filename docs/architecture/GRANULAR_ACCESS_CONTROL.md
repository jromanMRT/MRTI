# Permisos granulares del Centro de control — 2026-10-08

## Uso

Abrir `/dashboard?view=control-center&panel=permissions` como administrador.
Seleccionar un rol existente o una persona, expandir un módulo, indicar acceso y niveles por sección, escribir el motivo y guardar. El editor advierte que un cambio de rol afecta a todas las cuentas que lo heredan.

Ejemplo: permitir RH, nivel general **Sin acceso**, sección **Directorio y expediente → Sólo consulta**. Esa cuenta puede consultar el directorio, pero no nómina ni escribir en el expediente. **Restablecer herencia** prepara un cambio; sólo se aplica al guardar.

Niveles: `none` bloquea, `read` permite GET/HEAD/OPTIONS, `write` agrega POST/PUT/PATCH, `full` permite también eliminación. Operaciones con rutas de archivo/restauración/retiro/secretos/permisos requieren gestión completa. No equivale a promover al usuario a administrador.

## Propiedad y compatibilidad

Core es el único propietario de `access_policies` y `access_policy_events` (migración aditiva 023, sin FK entre módulos). UUID, rol global y rutas antiguas se conservan. El administrador global conserva acceso completo protegido.

Desde la migración aditiva 025 existen ocho roles base: Administrador, Responsable de área, Supervisor, Técnico, Capturista, Aprobador, Auditor y Consulta. Los cuatro valores históricos permanecen sin cambios y ninguna cuenta real fue reasignada durante la ampliación. Responsable de área y Capturista parten de lectura/escritura; Aprobador y Auditor parten de sólo consulta. Estos niveles se aplican únicamente dentro de los módulos ya permitidos por el área y pueden precisarse por rol, módulo, sección o UUID desde el editor. Son roles base fijos; las diferencias particulares se expresan mediante políticas, no creando variantes de rol.

La excepción del usuario prevalece por campo y sección sobre el rol. «Heredar» en usuario vuelve al rol; sin regla de rol conserva los permisos anteriores del área y las reglas del módulo. `access: true` permite también habilitar un módulo activo para una cuenta cuyo área no lo tenía. Cuenta inactiva o aplicación inactiva siguen sin acceso. Guardar nivel general `none` y habilitar secciones es la forma de crear una lista explícita de acceso.

Los niveles son una capa adicional de autorización: **no amplían** operaciones reservadas al administrador ni las reglas de confidencialidad de Legal, equipos de Tickets, empresas/importes/secciones de SAP o aislamiento del autoservicio. Legal agrupa expedientes/contratos/documentos porque comparten endpoints; no se implementa control por campo o por registro desde este editor. Los dashboards autorizados pueden contener agregados de varias áreas funcionales; deben deshabilitarse si esa vista excede el alcance deseado. Los endpoints de agentes con llave de operador y las integraciones entre servicios mantienen su autorización independiente.

Las políticas vacías conservan el acceso anterior. No se asignaron reglas a usuarios operativos durante el despliegue. La prueba temporal crea y limpia sus propias cuentas y reglas.

Core valida método/ruta cuando el consumidor los envía a `/api/auth/module-access/:code`; llamadas antiguas sin parámetros siguen verificando sólo el módulo. Todos los consumidores operativos publicados envían el contexto o validan el perfil fresco de Core. El frontend consulta `/api/auth/identity`, filtra navegación y evita montar páginas prohibidas. La API siempre decide, aun con una pestaña antigua. La navegación se actualiza al enfocar/recargar o cada 30 segundos; las salas de Monitor se revalidan cada 15 segundos, con espera de red máxima de 5 segundos.

El editor exige motivo, guarda antes/después y actor en una transacción y rechaza revisiones concurrentes con 409. Una política idéntica no crea eventos ni cambia revisión. La vista de acceso efectivo refleja lo guardado; no simula ediciones pendientes.

## Commits

- `MRTI@d3caacf`
- `MRTI-Platform@2d6505e`
- `MRTI-RH@069ca1b`
- `MRTI-Infra@dfda3e0`
- `MRTI-Activos@1607908`
- `MRTI-Legal@bd8cddb`
- `MRTI-SAP@20b50dd`
- `MRTI-Mantenimiento@58e6b5c`
- `MRTI-Agent@8323078`
- `MRTI-Tickets@aa60c91`
- Ampliación compatible de roles base: `MRTI@af4595f`, release `20261009-130516-af4595f-dirty`.

Implementación inicial Core `373649b`, Platform `7f88163`; los hashes posteriores incluyen correcciones de rutas alternativas. Monitor `dfda3e0` agrega la prueba de aislamiento de eventos. El movimiento independiente de Web-Page quedó en RH `098d880` y Monitor `5b5b88d`. Sin push.

## Evidencia

- Core: 81 aprobadas y 1 integración opt-in omitida en la suite normal; ejecutada aparte con `ACCESS_POLICY_INTEGRATION=1 node --test test/access-policy-contract.test.js`: 16/16, MySQL real, persistencia, UUID, auditoría, concurrencia, idempotencia DDL y revocación con el mismo token.
- Platform: suite de 24/24 y prueba adicional de rutas alternativas 1/1; `node bin/sync.mjs --check` sin divergencias.
- RH 256 aprobadas/5 omitidas; Activos 167/167; Legal 36 aprobadas/1 omitida; SAP 88/88; Mantenimiento 7/7; Monitor 12/12 más socket 1/1; Tickets 70/70; Go `go test ./cmd/mrti-monitor` aprobado. TypeScript y builds de todos los frontends aprobados.
- Chromium: seis escenarios del editor a 1440/390/320 px, claro/oscuro; guardar, persistencia, administrador protegido, acceso efectivo, sin errores JS ni desbordamiento. Siete consumidores rechazan URL directa antes de consultar datos y ocultan navegación prohibida.
- Publicado: 15 solicitudes restringidas a las APIs reales de los ocho módulos devuelven 403; Core permite la lectura de la sección habilitada (204), impide administración por usuario normal y aplica revocación al mismo token. Fixtures eliminadas al finalizar.
- Chromium contra el portal publicado, sin mocks: guardado de excepción para cuenta temporal, recarga, acceso efectivo y persistencia MySQL aprobados; cero errores JavaScript. La cuenta y sus políticas/eventos de prueba se retiraron.
- `node MRTI-Platform/bin/health.mjs`: todos los procesos, APIs y frontends saludables; smoke de HTML y asset con hash pasó al promover cada release.

Las evidencias locales y scripts reproducibles están en `/var/www/mrt/MRTI/run/access-control-20261008/`: `browser-results.json`, `consumer-browser-results.json`, `live-browser-results.json`, `published-smoke.json`, `health-final.txt`, `rollback.json`. No contienen tokens ni secretos.

## Publicación

Migración Core aplicada dos veces sin pérdida de datos; autoridad Core primero, luego consumidores y por último interfaces. No se retiraron rutas/tablas compatibles. No se rotaron secretos.

Core y Tickets se compilaron desde worktrees aislados para excluir cambios previos no relacionados. En Tickets se creó una imagen encima de la imagen operativa anterior: sólo reemplaza `dist/middlewares/auth.js` en backend y agrega el nuevo build en frontend. Los cambios pendientes de conocimiento/tickets no se publicaron con este trabajo. Los demás frontends se publicaron por release inmutable.

El ejecutable Go se respaldó y sustituyó atómicamente. Se reinició su proceso propiedad de `mrtcorporativo` mediante SIGTERM y la política existente de systemd `Restart=always`, sin modificar la unidad. Health 200 después de reiniciar.

| Módulo | Release publicado | Release anterior conservado |
|---|---|---|
| MRTI | `20261008-152025-373649b-dirty` | `20261008-084657-9a17e2b-dirty` |
| MRTI-RH | `20261008-152329-069ca1b` | `20261008-132039-fc99712-dirty` |
| MRTI-Infra | `20261008-152329-1a5bbff` | `20261008-132049-4d8ada0-dirty` |
| MRTI-Activos | `20261008-152329-1607908` | `20261005-100404-a667f38` |
| MRTI-Legal | `20261008-152329-bd8cddb` | `20261002-161311-3312634` |
| MRTI-SAP | `20261008-152329-20b50dd` | `20261005-131942-33f589d` |
| MRTI-Mantenimiento | `20261008-152329-58e6b5c` | `20261002-132431-fb0869b` |

Tickets usa las imágenes `mrti-tickets-backend:permissions-20261008` y `mrti-tickets-frontend:permissions-20261008`; sus versiones anteriores quedaron etiquetadas `:before-permissions-20261008`. Se conservan también los assets del build previo.

## Rollback

1. Para corregir una asignación, restaurar la política desde el editor y guardar con motivo. Es preferible a retirar el control de autorización.
2. Para revertir únicamente la interfaz, ejecutar `npm run release:promote -- <release-anterior>` en el repositorio correspondiente. Los identificadores exactos están arriba; las APIs mantienen las restricciones. La herramienta hace smoke y revierte sola si falla. Sus pruebas incluyen promote/rollback y fallo de smoke.
3. Tickets: retaggear `mrti-tickets-frontend:before-permissions-20261008` como `mrti-tickets-frontend:latest`, después `docker compose up -d --no-deps --no-build frontend`; comprobar HTML y assets. No reconstruir desde el árbol de trabajo con cambios ajenos.
4. **No retirar las validaciones de backend si ya existen políticas operativas**: hacerlo ampliaría acceso. Conservar Core y los guardas hasta restaurar una configuración equivalente revisada. Al momento de este despliegue no quedaron políticas de usuarios reales; para revertir entonces, restaurar los commits anteriores en un checkout separado y reiniciar cada API con smoke antes de continuar. Primero consumidores y al final Core. Conservar las tablas y el registro de migración 023 para recuperación.
5. Backend Tickets anterior: retaggear `mrti-tickets-backend:before-permissions-20261008` como `mrti-tickets-backend:latest` y recrear sólo backend con `--no-build --no-deps`, respetando el punto anterior. Go: copiar `run/access-control-20261008/mrti-monitor.before` a un archivo vecino del binario, sustituir atómicamente `bin/mrti-monitor` y reiniciar el servicio; comprobar `/healthz` y autorización. No exponer llaves del proceso en la terminal.
6. Mantener Web-Page en Monitor al revertir permisos: es una solicitud independiente ya publicada.

No borrar tablas/endpoints antiguos ni hacer push como parte de este rollback. Preservar los cambios ajenos en Core y Tickets.

Para revertir sólo la ampliación de roles, primero reasignar cualquier cuenta que use `area_manager`, `data_entry`, `approver` o `auditor` a uno de los cuatro valores históricos; después promover `20261009-130302-f031500-dirty`, revertir `af4595f` y reiniciar Core. No reducir el `ENUM` mientras existan filas con un rol nuevo. La migración 025 puede conservarse aplicada durante un rollback de código porque es aditiva.
