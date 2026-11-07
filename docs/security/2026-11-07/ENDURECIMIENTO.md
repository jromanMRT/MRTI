# Endurecimiento de MRTI — 7 de noviembre de 2026

## Resultado publicado

Se corrigieron las vías de acceso anónimo de Agent, la correlación/vinculación de Google SSO y la falta de revocación de sesiones. Se actualizaron dependencias vulnerables, se publicaron los componentes afectados y se conservaron UUID, rutas y bases de datos existentes. No se hizo push ni se rotaron secretos.

- **Core:** OAuth usa state aleatorio de un solo uso ligado a cookie HttpOnly/Secure, nonce, PKCE S256, comprobación de correo verificado/dominio y vinculación coherente por Google sub. El callback ya no entrega JWT en URL: intercambia un comprobante opaco de un solo uso mediante POST con comprobación de origen. El flujo completo se probó con proveedor simulado; no se inició sesión con una cuenta Google real durante esta revisión.
- **Sesiones:** logout registra la huella del token hasta su expiración. Cambio/restablecimiento de contraseña, cambio de correo administrativo y desactivación incrementan session_version. El cambio propio devuelve una nueva sesión al navegador. Los tokens anteriores a esta migración siguen funcionando hasta que se revocan; reactivar una cuenta no revive sus sesiones anteriores. Registro público desactivado por defecto, manteniendo la variable de configuración explícita.
- **Migración 031:** columna y tabla adicionales, idempotentes, sin borrar ni renumerar usuarios. Aplicada dos veces en MySQL desechable; runner publicado ejecutado dos veces (primera aplica, segunda sin pendientes). La migración 030 de Google ya estaba aplicada; se versionó como prerrequisito existente.
- **Agent Go/Node:** GET de comandos exige la llave configurada antes de acceder a la cola; métricas exigen sesión/permisos de Core. Se elimina la llave demo predeterminada y se rechaza el acceso si falta configuración. La llave existente funciona para el sondeo de un ID ficticio; no se consumieron comandos reales. El servicio Node paralelo carece de llave configurada y responde 503 a sondeos: cierre seguro, no se le asignó otra llave.
- **Go:** compilación con Go 1.26.10, grpc 1.83.2 y x/net 0.62.0, después de verificar los avisos del [registro oficial de Go](https://pkg.go.dev/vuln/) y las [versiones oficiales](https://go.dev/dl/). El monitor publicado usa estas correcciones. Se compiló además un candidato Windows amd64 en el directorio privado de trabajo, sin desplegarlo en equipos ni publicar un instalador nuevo.
- **Tickets:** dependencias corregidas, imagen reproducible con npm ci/lockfile y eliminación de dependencias de desarrollo en la imagen del backend. Las llaves literales de Compose se sustituyeron por variables obligatorias; sus valores existentes se conservaron en .env ignorado con modo 600. No se imprimen ni se incluyen en este informe.
- **Web-Page:** límites persistentes de 10 intentos por cuenta y 120 por dirección de conexión cada 15 minutos, con actualización SQLite atómica, HTTP 429 y Retry-After. Se conservan CSRF y regeneración de sesión. No se confía en cabeceras reenviadas del cliente; detrás del proxy varios clientes comparten el límite por conexión.

## Evidencia

| Comprobación | Resultado |
|---|---|
| npm audit, 20 árboles revisados | 0 avisos conocidos; ver audit-final-summary.json |
| Tickets dentro del contenedor publicado, npm audit --omit=dev | 0 avisos |
| Core | 106 pruebas aprobadas, 2 omitidas, 0 fallos |
| Revocación por Nginx con cuentas desechables | logout, cambio propio, reset administrativo y desactivar/reactivar correctos; fixtures eliminados |
| Agent Node | 12/12 aprobadas |
| Agent Go | go test ./... aprobado; govulncheck sin avisos para Linux, Windows y binario monitor publicado |
| Tickets | 71 pruebas backend y 4 frontend aprobadas; TypeScript y ambas imágenes Docker compiladas |
| Frontends | 9 compilaciones aisladas aprobadas |
| Obs | lint aprobado tras actualización de dependencias |
| Tickets lint | backend aprobado; frontend conserva 18 errores en archivos de aplicación no modificados; no se declara aprobado |
| Web-Page | límites, normalización, persistencia, expiración y esquema idempotente probados; PHP sin errores sintácticos; límite probado con SQLite publicado y filas ficticias eliminadas; contenedor healthy; login publicado 200 |
| Acceso HTTPS público existente | OAuth entrega state/nonce de 43 caracteres y PKCE S256, cookie HttpOnly/Secure; callback sin correlación rechazado; métricas 401 |
| Smoke final | portada y 8 módulos 200, identidad anónima 401, métricas anónimas 401, salud Tickets 200 |
| Nginx propuesto | nginx -t y smoke aislado en 127.0.0.1:18089 aprobados; rutas ocultas 404, cabeceras presentes, APIs protegidas |

Los logs completos, auditorías JSON y respaldos están en `/var/www/mrt/MRTI/run/security-hardening-20261107` (directorio privado). Una selección sin credenciales acompaña este documento. No se hicieron pruebas destructivas ni una auditoría exhaustiva de todas las rutas/roles, sistema operativo o imágenes base. Cero avisos de dependencias no equivale a ausencia de vulnerabilidades.

## Publicación y compatibilidad

- Core: frontend `20261107-155210-a64fc57`, backend PM2 con commits a64fc57 y b2ed146.
- Obs: frontend `20261107-155610-ce8ea80`.
- RH: frontend `20261107-155646-8953419`, construido desde el código que estaba publicado (e95d75a) más las dependencias corregidas. El backend de RH conserva su checkout en run/rh-publication-20261105/source/server. El repositorio principal registra la actualización equivalente en b9dfad4.
- Agent: monitor reemplazado atómicamente y reiniciado mediante SIGTERM al proceso de la propia cuenta, con reinicio normal por systemd. SHA256 en monitor-final-sha256.txt. Node reiniciado en PM2.
- Tickets y Web-Page: imágenes reconstruidas y contenedores recreados sin tocar bases ni volúmenes.
- Admin, Activos, Legal, SAP y Mantenimiento: herramientas de construcción actualizadas, compiladas y registradas en sus repositorios; no se necesitó publicar sus frontends por estos cambios de herramientas.

Se preservaron los cambios de trabajo ajenos. En Core se incorporaron los prerrequisitos de SSO/endurecimiento ya presentes, dejando fuera del commit el cambio visual de requisiciones y otros ajustes de portada. MRTI-Admin ya versionaba node_modules: su instalación actualizada deja archivos generados modificados; se versionaron package.json/lockfile y no se mezcló ese código generado con cambios de aplicación. Todos los commits son locales; mapa completo en commits.json.

## Pendientes explícitos

1. **HTTP interno:** por decisión del usuario se conserva el acceso actual. Sigue sin cifrar credenciales/tokens en la LAN. HTTPS está preparado en `MRTI-Platform/deploy/security/it-infra.https.conf.template`; faltan DNS permanente y certificado válido antes de activarlo. No se fuerza redirección ni se cambia el callback actual de Google.
2. **Nginx del host:** cabeceras y rechazo de rutas ocultas están preparados y probados, pero no aplicados: la cuenta no tiene sudo no interactivo. Un administrador puede revisar y ejecutar `sudo python3 /var/www/mrt/MRTI/MRTI-Platform/deploy/security/apply-http.py`. El script verifica la huella de la configuración, guarda respaldo y restaura si la validación/recarga falla. Procedimiento en el README del mismo directorio.
3. **Secretos previamente versionados:** retirarlos del Compose actual no los elimina del historial. Rotación coordinada pendiente de autorización explícita según AGENTS.md; no se cambió ninguna llave. Revisar también copias históricas e instaladores con configuración incrustada antes de redistribuirlos.
4. **Agent en otros equipos:** la llave sigue compartida por la flota; debe migrarse por fases a identidades por dispositivo. El nuevo monitor no actualiza los binarios instalados en estaciones. El candidato Windows debe entrar en el procedimiento de empaquetado, firma y despliegue gradual; los paquetes antiguos no se retiraron.
5. **Archivos públicos de Obs:** sigue pendiente clasificar imágenes/ZIP de uploads para decidir cuáles requieren autenticación. No se confirmó contenido confidencial; no se bloquearon sin conocer sus consumidores.
6. **Alcance restante:** sesiones JWT todavía se almacenan en el navegador y existe compatibilidad entre módulos. No se afirma haber descartado todos los IDOR/XSS/SSRF, accesos indebidos históricos ni riesgos de infraestructura. El lint del frontend Tickets tiene deuda pendiente señalada arriba.

## Rollback

Preferir una corrección hacia adelante: volver al código antiguo reabre las vulnerabilidades y puede dejar de aplicar las revocaciones.

- **Core backend:** restaurar sólo los archivos afectados desde `run/security-hardening-20261107/before/MRTI`, reiniciar mrti-core-api. Conservar session_version/revoked_session_tokens y datos de Google; no borrar tablas. **Frontend:** `node scripts/mrti-platform/release.mjs promote 20261025-000247-30a62cd` desde MRTI.
- **Obs frontend:** promover `20261025-000247-72fa2cb`. **RH frontend:** promover `20261105-153104-e95d75a`. Se conservaron los assets anteriores para pestañas abiertas.
- **Agent:** copiar mrti-monitor.before a un archivo nuevo junto al binario, modo 755 y renombrar atómicamente a `/var/www/mrt/MRTI/bin/mrti-monitor`; enviar SIGTERM al MainPID propio para que systemd reinicie. Node: restaurar app.js del respaldo y reiniciar mrti-agent-core-api. No cambiar llaves.
- **Tickets:** retag de `mrti-tickets-backend-1:security-before-20261107` a `mrti-tickets-backend:latest` y de `mrti-tickets-frontend-1:security-before-20261107` a `mrti-tickets-frontend:latest`, seguido de `docker compose up -d --no-build --no-deps backend frontend` desde MRTI-Tickets. Mantener .env y volúmenes.
- **Web-Page:** retag `mrti-web-page:security-before-20261107` a `mrti-web-page:local`, ejecutar `docker compose up -d --no-build --no-deps web` desde Web-Page. Conservar la tabla login_attempt_limits (aditiva, compatible).
- **Nginx:** todavía no modificado. Si se aplica después, el script imprime el respaldo y destino exactos. Restaurar ese archivo y validar nginx -t antes de recargar.
