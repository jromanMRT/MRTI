# Revisión de plataforma — 10 de septiembre de 2026

Se corrigieron fallos reproducibles y se publicaron las correcciones. Esta revisión
no certifica ausencia de todos los errores ni completa las fases pendientes de migración.

## Correcciones

- Monitor: al desmontar una pantalla se elimina también el listener de reconexión.
  Cambiar dispositivos actualiza el sondeo; un array equivalente no reinicia suscripciones.
  Las dos regresiones fallan con el código anterior y pasan con el corregido.
- Monitor: 31 errores de ESLint corregidos mediante tipos de filas, eventos y errores.
  El cliente de datos distingue listas, filas creadas y conteos de mutaciones.
  Se conservan siete advertencias de desarrollo (Fast Refresh y dependencias de efectos
  en las pantallas heredadas de inventario); no se desactivaron reglas para ocultarlas.
- RH, Activos y Legal: autoservicio y guardas administrativas devuelven 503 cuando Core
  no responde, falla o entrega una respuesta de identidad inválida. El rechazo de sesión
  conserva 401 y el rol insuficiente 403. Los consumidores auxiliares conservan null.
  Veinte casos por módulo prueban sesión válida, ausencia, rechazo, red, timeout y formato.
- Core: se confina la decoración del fondo para evitar desplazamiento horizontal.
- RH: el campo y botón de alta de unidades pueden encogerse dentro de su columna.
- Agent/Monitor: la consulta de permisos a Core tiene deadline de cinco segundos,
  conserva un deadline anterior del cliente y deniega ante cancelación o fallo.

## Evidencia

| Suite JavaScript | Aprobadas |
|---|---:|
| Core, unitarias sin contratos | 13 |
| Core, contratos auth/portal/personalización vía Nginx | 22 |
| Monitor, servidor unitario | 2 |
| Monitor, frontend (suscripciones y cliente de datos) | 10 |
| RH | 85 |
| Activos | 107 |
| Legal | 30 |
| Tickets, backend | 39 |
| Tickets, frontend | 2 |
| **Total** | **310** |

`go test -count=1 ./...` pasó en Agent: cuatro paquetes con pruebas, incluido
el nuevo contrato de autorización; el resto se compiló y reportó ausencia de tests.
El binario de Monitor se compiló y su `/healthz` publicado respondió 200.

Siete compilaciones iniciales pasaron: seis frontends y backend de Tickets.
Los tres frontends modificados se recompilaron; TypeScript de Monitor y ambos
proyectos Tickets pasó. ESLint Tickets frontend/backend pasó. `git diff --check`
pasó en los siete repositorios.

El recorrido final de Chromium cubrió **56 URLs en dos tamaños (1440×900 y
390×844), 112 vistas**, sin excepciones JavaScript, fallos HTTP inesperados,
pantallas vacías ni desbordamiento horizontal de la página. Incluye portadas,
formularios sin enviar, catálogos de Activos, Perfil/Centro de control, RH,
Tickets, Legal, Monitor, Agent y Descargas. Los JSON adjuntos contienen el
resultado por URL. No equivale a probar todas las acciones de esos formularios.

Las cinco APIs administrativas respondieron 401 sin token, 401 con token inválido,
403 para un viewer sin módulos y 200 para administrador: 20 combinaciones.
Los seis health checks de APIs respondieron 200; cinco procesos PM2 online,
Tickets Docker activo y `mrti-monitor.service` activo. Hubo cero identidades
residuales tras cada recorrido. No se alteraron expedientes, activos ni tickets reales.

Después de reiniciar Activos, RH y Legal no aparecieron errores de aplicación.
Activos registró una advertencia DEP0123 del cliente TLS al usar una IP como
ServerName; permanece como deuda de configuración, sin rotación de secretos.

## Publicación y cambios previos

Core, Monitor y RH se publicaron copiando assets antes del índice y conservando
los assets anteriores para clientes abiertos. Las APIs de Activos, RH y Legal
se reiniciaron. Agent se reemplazó atómicamente y su proceso propiedad del usuario
se relevó mediante SIGTERM; systemd (`Restart=always`) lo levantó de nuevo.

RH se compiló desde un snapshot limpio más el ajuste de Unidades. El build limpio
produjo el mismo bundle `index-MDEF0gAj.js` que estaba publicado; así se excluyó el
cambio previo de `PositionListPage.jsx`. El cambio previo del backend de Puestos
ya precedía el arranque del proceso (archivo: 04/09, arranque: 10/09), y se conservó.
También permaneció intacto y fuera de commits el cambio previo de `src/remissionPrint.js`
en Activos. No hubo push, cambio de secretos, esquema ni retiro de rutas.
Migración idempotente: no aplica; ninguna corrección modifica datos persistentes.

## Repetir y límites

- Pruebas Node: `npm test` desde los servidores RH/Activos/Legal y proyectos Tickets;
  `npm test` desde Monitor ejecuta las regresiones de frontend.
- Core: desde `MRTI/server`, ejecutar los archivos unitarios y
  `CONTRACT_TEST_URL=http://127.0.0.1 node --test test/auth-contract.test.js test/portal-contract.test.js test/personalization-contract.test.js`.
- Agent: `go test -count=1 ./...` y `go build ./cmd/mrti-monitor` con Go 1.26.5.
- Navegador: `MRTI_QA_WRITE_FIXTURES=1 node scripts/qa-browser.mjs` desde Core.
  Requiere Playwright; si está fuera del proyecto, definir `MRTI_PLAYWRIGHT_MODULE`
  con la ruta absoluta al módulo, y opcionalmente `MRTI_CHROMIUM_PATH`.
  `MRTI_QA_OUTPUT` cambia el directorio de resultados (predeterminado `/tmp/mrti-platform-qa`).
  La prueba crea dos identidades desechables y las elimina en finally; no cambia
  datos de negocio. No ejecutar contra otra base/origen sin alinear configuración.

No se ejecutó el contrato que modifica temporalmente la apariencia global, ni el
contrato heredado que inserta identidades en Infra. No se hicieron pruebas de carga,
restauración de backups, todos los CRUD, sincronizaciones con escritura a SAP,
impresión física, instaladores en endpoints ni una matriz completa de navegadores/temas.
La prueba con token inválido no se presenta como una prueba de expiración real.

## Commits y rollback

| Repositorio | Commit de implementación |
|---|---|
| MRTI-Infra | `04c38677e923` |
| MRTI-RH | `b7853528813c` |
| MRTI-Activos | `42892edf7483` |
| MRTI-Legal | `edc020d1c6c1` |
| MRTI | `feb5e3ac5ea7` |
| MRTI-Agent | `53890f168241` |

Revertir únicamente el commit correspondiente y reconstruir/reiniciar ese módulo.
No hay base de datos que revertir. Los frontends anteriores se conservaron en
`/tmp/mrti-qa-20260910/rollback/{MRTI,MRTI-Infra,MRTI-RH}`; restaurar el índice
previo vuelve a sus assets, que siguen publicados. Para Agent, el binario anterior
está en `/var/www/mrt/MRTI/bin/mrti-monitor.rollback-qa-20260910`.
Estos respaldos locales son una vía de retorno inmediata; Git conserva la reversión
reproducible. Logs completos de esta ejecución: `/tmp/mrti-qa-20260910`.
