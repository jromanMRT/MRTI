# Navegación responsive — 2026-10-13

Referencia: MRTI-Tickets, menú desplegable hasta 900 px. Core, RH,
Activos, Legal, SAP, Mantenimiento y Monitor ajustan el encabezado,
reducen texto secundario y conservan navegación desplazable y controles.
Core también cierra el menú con Escape.

Publicado en los siete frontends como `20261013-205222-responsive`.
Prueba Chromium con sesión y respuestas API simuladas: 320, 390, 820,
900, 1024, 1280 y 1440 px; 49 casos correctos. Verifica límites del
encabezado, ausencia de desbordamiento, menú visible hasta 900 px y
apertura/cierre con Escape. No verifica datos reales de negocio.
Siete compilaciones correctas; smoke publicado de HTML/JS HTTP 200.
Los cambios pendientes del canal de mensajes no se incluyen.

Rollback: `npm run release:rollback` desde el repositorio afectado.
El publicador conserva la versión inmediatamente anterior; su política
de retención retiró releases más antiguos, reconstruibles desde sus fuentes.

Agent Core: ajustes preparados en dashboard y descargas; `go test
./cmd/mrti-monitor` y compilación correctos. No publicado: reiniciar
`mrti-monitor.service` requiere privilegios no disponibles (`sudo -n`
requiere autenticación). Binario de prueba en
`/tmp/mrti-responsive-publish-Syrmpo/mrti-monitor`; incorpora el estado
local del repo, incluidos cambios de marca preexistentes.
