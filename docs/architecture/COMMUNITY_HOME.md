# Portada comunitaria — 2026-10-09

## Comportamiento y operación

La raíz `/` conserva noticias, marca, rutas y sesión existentes. Añade:

- Cumpleaños de hoy y los siguientes 30 días, públicos: sólo nombre, ocurrencia
  anual y empresa. Fichas activas de fuentes vigentes y altas locales de RH.
  No publica ID de empleado, fecha de nacimiento completa, edad, correo o sueldo.
- Eventos de RH de hoy a 30 días: título, descripción, fechas, lugar y empresa.
  Se administran en `/rh/celebraciones` con sus permisos existentes. Los eventos
  guardados en ese calendario se muestran públicamente en el periodo indicado.
- Encuestas sólo con sesión válida, una respuesta por UUID y encuesta, sin
  requerir acceso administrativo a un módulo. RH ve resultados agregados.
  Publicar fija pregunta/opciones, permite cerrar anticipadamente y conserva votos.
- Canal público siempre anónimo, con categorías queja/denuncia/sugerencia.
  Entrega folio aleatorio y clave de 144 bits. Sólo se guarda SHA-256 de la clave;
  consulta mediante POST, nunca en la URL. El comprobante se descarga por decisión
  del visitante y no se conserva automáticamente en almacenamiento del navegador.

Con sesión RH/administrador, **Portada → Administrar comunidad** abre la bandeja,
encuestas y límites. Se aplica la sección existente `rh/news` del control granular:
consulta puede leer, escritura puede atender/publicar/configurar. La API valida
los permisos en cada solicitud; un botón visible no concede acceso. El calendario
sigue teniendo su autorización propietaria en RH.

## Propiedad y contratos

RH expone `GET /api/rh-public/community-calendar`, proyección mínima de sólo lectura
con ventana fija; Core la consume por HTTP con timeout de cinco segundos y sin
reenviar la sesión del visitante. RH tiene caché de 60 segundos compartida para
lecturas concurrentes. No hay otra copia del maestro laboral ni SQL entre bases.
Una caída del calendario afecta sólo sus tarjetas.

Core guarda encuestas, votos, reportes, seguimiento y configuración como participación
en su portada. Migración aditiva/idempotente `024_community_home.sql`: siete tablas,
FK únicamente entre tablas nuevas de Core. No cambia cuentas, UUID, roles ni rutas
compatibles. RH no necesita migración: su nuevo endpoint se agrega sin escrituras.

Base API: `/api/portal/v1/community`.

| Ruta | Acceso |
|---|---|
| GET `/calendar`, `/channel`, `/challenge` | Público |
| POST `/reports`, `/report-status` | Público, con controles de abuso |
| GET `/polls`, POST `/polls/:id/vote` | Sesión de Core |
| GET `/admin/capabilities`, `/admin/settings`, `/admin/polls`, `/admin/reports`, `/admin/reports/:id` | RH/news consulta o administrador |
| PUT `/admin/settings`, POST `/admin/polls`, POST `/admin/polls/:id/close`, PATCH `/admin/reports/:id` | RH/news escritura o administrador |

## Anonimato y controles de abuso

El formulario público no envía cookies ni Authorization. Su handler no resuelve la
sesión; descarta cualquier identidad que se intente incluir. El reporte no almacena
IP, cuenta, navegador ni request-id. No llama al auditor general al recibirlo, pues
éste sí guarda IP/actor. Los errores SQL se reducen al código sin imprimir texto
recibido. Lecturas y atención administrativas sí tienen auditoría; ésta sólo guarda
referencia de reporte, nunca cuerpo, respuesta ni nota interna. El historial privado
conserva el UUID del atendente, estado, nota y respuesta en una transacción.

Esto ofrece anonimato ante la bandeja, no una garantía de anonimato de red: Nginx,
servidores y red corporativa pueden conservar registros técnicos de conexión. El
formulario lo explica y recomienda no escribir datos que identifiquen al denunciante.
No se eliminan logs existentes ni se afirma anonimato criptográfico frente al operador.

Protecciones combinadas:

- Verificación aritmética firmada, espera mínima de tres segundos, vencimiento a
  15 minutos y nonce de un solo uso. Campo trampa y máximo de 5,000 caracteres.
- Límite de 40 intentos públicos por 15 minutos y red/IP en memoria (challenge,
  envío y consulta); usa `ipKeyGenerator` para agrupar IPv6. No es un CAPTCHA de un
  proveedor externo ni garantiza detener bots distribuidos.
- Cuotas persistentes iniciales de 5 envíos/hora y 20/día por red, 200/día globales.
  RH puede ajustar o pausar sin cerrar la consulta de folios. Ventanas alineadas a
  hora/día UTC; redes compartidas NAT comparten cuota, señalado en configuración.
- Contadores independientes por HMAC diario de dirección/prefijo IP; ningún vínculo
  entre contador y reporte. Expiran en dos días y se purgan en la siguiente alta
  exitosa. Nonces expiran en 20 minutos. No se almacena IP en claro en estas tablas.
- Configuración bloqueada por fila dentro de la transacción: verificar límites,
  consumir nonce e insertar reporte confirma todo o nada, incluso entre procesos.
  Se devuelve 429 al alcanzar cuota y 503 si está pausado.
- Voto único por PK `(poll_id,user_id)` y candado de encuesta: concurrencia no
  duplica respuestas ni permite votar después del cierre. Ediciones de seguimiento
  y límites exigen revisión optimista (409 si cambió).

No se envían correos ni avisos externos. No se agregan adjuntos ni recolección de
contactos. Las respuestas al denunciante se consultan con folio+clave y nunca
incluyen notas internas. Spam se muestra al denunciante como «En revisión».

## Validación

Evidencia: `run/community-home-20261009/` en el workspace padre.

- `node --test` de dominio/comunidad, permisos, políticas de contraseña,
  personalización, aprovisionamiento, notificaciones, equipos/SLA y calendario:
  36/36. No usan datos personales ni modifican negocio.
- `COMMUNITY_DB_TEST=1 node --test server/test/community.integration.test.js`:
  ocho escenarios HTTP/MySQL, con tablas QA de prefijo aleatorio y auth simulada;
  migración dos veces y otra con datos, permisos, votos concurrentes/cierre,
  anonimato, replay, clave incorrecta, concurrencia de seguimiento, rollback
  ante fallo de INSERT, cuotas y pausa. Tablas QA retiradas en finally.
- Con `COMMUNITY_BROWSER_TEST=1`, el mismo servidor real de rutas y MySQL QA sirve
  el build. Chromium verifica 1440/390/320 × claro/oscuro, diálogo y Escape,
  envío sin Authorization/cookies, comprobante, seguimiento privado/público,
  alta/voto persistente de encuesta y guardado de límites. Cero errores JS y
  desbordamientos; se corrigió el mínimo heredado de 320px en la grilla vacía de
  noticias para la portada de 320px.
- Suite completa RH del árbol local: 256 aprobadas, 5 omitidas y 2 fallos ajenos
  en `leaveManagerApproval.test.js` y `toolsHubFrontend.test.js`, asociados a
  modificaciones previas de vacaciones/requisiciones. Los archivos implicados
  no se cambiaron en este trabajo; no se afirma que toda esa suite pase.
- Consulta real RH de sólo lectura: 32 cumpleaños y 0 eventos en 2026-10-09 a
  2026-11-08. No se sembraron eventos ni encuestas ficticias en producción.
- Build Core preparado, sintaxis y `git diff --check` aprobados. Sin dependencias
  nuevas. RH no cambia frontend: no requiere recompilarlo.

Variables de prueba visual: `COMMUNITY_BUILD_DIR`, `COMMUNITY_BROWSER_OUTPUT`,
`COMMUNITY_PLAYWRIGHT_MODULE`, `COMMUNITY_CHROMIUM_PATH`. En este host Chromium usa
`LD_LIBRARY_PATH=/tmp/mrti-browser-libs/root/usr/lib/x86_64-linux-gnu`.

## Publicación y rollback

Core `d6d4d43`; RH `0b396ff`. Migración 024 aplicada y segunda ejecución sin
pendientes. Release Core `20261009-100345-d6d4d43-dirty` promovido sobre
`20261009-092354-db9df87-dirty`; el sufijo `dirty` corresponde a cambios previos
preservados en `src/main.js`/`src/public-session.js`, que ya estaban publicados.
Se reiniciaron y guardaron sólo `mrti-core-api` y `mrti-rh-api` en PM2.

Smoke publicado por Nginx: home, health y calendario 200; calendario real con
32 cumpleaños y cero eventos; encuestas y bandeja sin sesión 401; alta anónima
201 y consulta por folio/clave 200/`received`. Se retiraron reporte, contador y
nonce temporales: 0 residuos. Los procesos quedaron online. Evidencia en
`run/community-home-20261009/published-smoke.json` y logs del mismo directorio.

Release anterior al trabajo: Core `20261009-092354-db9df87-dirty`.
Los cambios previos en `src/main.js` y `src/public-session.js` ya estaban en ese
release: se conservan byte por byte y no se incluyen en el commit. RH conserva
vacaciones/requisiciones en su árbol; sólo se agregan dos líneas al montaje del
servidor y archivos nuevos. Los cambios ajenos se respaldaron en `run/.../*before*`.

Rollback aditivo, sin borrar reportes o votos:

1. `npm run release:promote -- 20261009-092354-db9df87-dirty` desde Core.
2. Revertir únicamente los commits de esta función en Core/RH (o retirar los
   imports/montajes `communityRouter`/`publicCommunityCalendarRouter`, preservando
   cualquier modificación posterior de otros trabajos).
3. Reiniciar únicamente `mrti-core-api` y `mrti-rh-api`. Verificar health, home,
   login y 401 en rutas protegidas existentes.
4. Conservar las siete tablas y sus datos. La versión anterior los ignora; no
   ejecutar DROP ni revertir identidades. No requiere rotar secretos ni Nginx.

Para pausar sólo las altas, usar **Límites del canal → Canal abierto**, sin rollback:
la consulta de folios y la atención privada siguen disponibles.
