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

- [ ] Crear `MRTI/server/` con Express, health check y configuración validada.
- [ ] Copiar/adaptar autenticación y control de acceso desde Infra.
- [ ] Conectar temporalmente a las tablas actuales de `mrti_infra`.
- [ ] Conservar exactamente `/api/auth/*` y respuestas existentes.
- [ ] Añadir `ecosystem.config.cjs` y puerto dedicado documentado.
- [ ] Ejecutar pruebas de contrato contra Infra y Core y comparar resultados.
- [ ] Probar tokens emitidos por Core en Infra, RH, Activos, Tickets y Agent.

Criterio de terminado:

- Core responde el mismo contrato con los mismos UUID y permisos.
- Ningún consumidor necesita cambios para usarlo.

Rollback:

- Detener Core y conservar Nginx apuntando a Infra.

### Fase 2 — Corte de tráfico de autenticación

Objetivo: hacer que Core atienda autenticación en producción.

Checklist:

- [ ] Añadir una ubicación Nginx específica para `/api/auth/` antes de `/api/`.
- [ ] Apuntar `/api/auth/` al puerto de Core.
- [ ] Validar `nginx -t`, recargar y ejecutar smoke tests autenticados.
- [ ] Confirmar login, `/me`, Centro de control y permisos en cada módulo.
- [ ] Vigilar códigos 5xx/401 inesperados y logs durante el periodo acordado.
- [ ] Mantener Infra listo para recuperar tráfico sin redeploy.

Criterio de terminado:

- Todo el tráfico de autenticación llega a Core sin incremento de errores.

Rollback:

- Restaurar el upstream anterior de `/api/auth/` y recargar Nginx.

### Fase 3 — Base `mrti_core` y propiedad de datos

Objetivo: mover identidad fuera del esquema de Infra.

Checklist:

- [ ] Crear migraciones idempotentes para `mrti_core`.
- [ ] Copiar tablas preservando UUID, timestamps, hashes y relaciones.
- [ ] Comparar conteos y checksums por tabla.
- [ ] Definir una ventana breve de solo lectura o un mecanismo temporal de doble
      escritura; nunca copiar mientras se aceptan escrituras no replicadas.
- [ ] Cambiar únicamente Core a `mrti_core`.
- [ ] Repetir contratos, login, permisos y pruebas de todos los consumidores.
- [ ] Conservar las tablas antiguas en modo solo lectura durante compatibilidad.

Criterio de terminado:

- Core opera exclusivamente con `mrti_core` y los datos conciliados coinciden.

Rollback:

- Volver la conexión de Core a las tablas antiguas. No borrar ninguna copia.

### Fase 4 — Consumidores y nombres de configuración

Objetivo: que todos los módulos reconozcan a Core como autoridad.

Checklist:

- [ ] Introducir `MRTI_CORE_URL` en Infra, RH, Activos, Tickets y Agent.
- [ ] Mantener fallback temporal a `MRTI_INFRA_URL` con advertencia.
- [ ] Cambiar documentación y ejemplos de entorno.
- [ ] Validar módulo autorizado, prohibido, sesión expirada y Core no disponible.
- [ ] Añadir timeouts y mensajes `503` consistentes.

Criterio de terminado:

- Ningún código nuevo describe Infra como proveedor de identidad.

Rollback:

- Reponer la variable anterior; el contrato de rutas continúa compatible.

### Fase 5 — Limpiar identidad de Infra

Objetivo: dejar MRTI Infra enfocado en infraestructura.

Checklist:

- [ ] Confirmar tráfico cero a los handlers de autenticación de Infra.
- [ ] Retirar montaje de rutas, imports y dependencias de JWT/contraseñas.
- [ ] Eliminar del frontend de Infra la administración de usuarios/permisos.
- [ ] Mantener únicamente referencias `user_id` externas necesarias.
- [ ] No borrar tablas antiguas hasta completar el periodo de retención.

Criterio de terminado:

- Infra inicia y opera sin código de autenticación propio ni escritura de usuarios.

Rollback:

- Revertir el commit de limpieza; las tablas antiguas siguen disponibles.

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
| 1. Backend propio de Core | Pendiente | — | — |
| 2. Corte de tráfico auth | Pendiente | — | — |
| 3. Base `mrti_core` | Pendiente | — | — |
| 4. Consumidores a Core | Pendiente | — | — |
| 5. Limpiar identidad de Infra | Pendiente | — | — |
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

