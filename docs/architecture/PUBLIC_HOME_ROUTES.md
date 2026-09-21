# Home empresarial en la raíz — 2026-09-21

Configuración vigente, solicitada después de la primera separación de rutas:

- `/`: información empresarial, siempre pública, incluso con sesión vigente.
- `/login`: inicio de sesión; una sesión vigente continúa a Mi espacio.
- `/mi-espacio`: dashboard personal; sin sesión abre login y conserva el destino.
- `/home` y `/home/`: compatibilidad mediante redirección a `/`.
- Los enlaces antiguos `/?view=...`, `/?openTicket=...`, `/?accessDenied=...`
  y `/?returnTo=...` se resuelven en las rutas nuevas conservando parámetros.
- Mi espacio y las marcas de regreso a Core de Activos, RH, Legal, Monitor y
  Tickets apuntan a `/mi-espacio`. El home público conserva su marca hacia `/`.

Core conserva identidad, UUID, permisos, API y noticias existentes. No hay
migración de datos ni cambios de Nginx/dependencias. El cambio de rutas es
aditivo y su despliegue se puede repetir sin modificar datos.

## Código y publicación

MRTI `37461bb`; MRTI-Activos `6e8eb70`; MRTI-RH `23aa2f4`; MRTI-Legal `f3e8242`; MRTI-Infra `730bfbe`; MRTI-Tickets `abf7cb7`; MRTI-Agent `f28e90e`.

Core y los cinco módulos web publicados; Tickets recreó sólo frontend.
Activos y RH se compilaron desde HEAD más los cambios de navegación, excluyendo
los cambios locales ajenos en remisión, puestos y backend. Core preserva sus
cambios locales previos del editor/backend de noticias sin incluirlos en el commit.

Agent compilado y probado: el binario actualizado está instalado en
`/var/www/mrt/MRTI/bin/mrti-monitor`, pero el proceso sigue usando la versión
anterior. Tanto sudo no interactivo como systemctl sin pedir contraseña
rechazaron reiniciar por falta de autorización del sistema operativo.
Pendiente exclusivamente activar sus enlaces con:

```sh
sudo systemctl restart mrti-monitor.service
```

Hasta entonces, sus enlaces antiguos a raíz llegan al home público; desde allí
el acceso permite volver al dashboard. No se afirma publicado el enlace nuevo
ni se interrumpió el proceso actual de Agent.

## Evidencia

Directorio local de trabajo y respaldo: `/tmp/mrti-root-home-a6tj38ut`.

- Sintaxis de Core y `git diff --check` de siete repositorios: correctos.
- 13/13 contratos de autenticación contra la IP publicada:
  `CONTRACT_TEST_URL=http://192.168.1.203 node --test test/auth-contract.test.js`.
- Seis builds frontend correctos; Tickets incluye TypeScript.
- `go test ./...` y `go build ./cmd/mrti-monitor` correctos con Go local 1.26.5.
- Chromium publicado: 28 comprobaciones de rutas en 1440 y 390 px, además de
  recarga, Atrás/Adelante, login real, logout, raíz con sesión, sesión inválida,
  returnTo y prevención de bucle al pedir volver a login. Sin errores JS ni
  overflow en home móvil. Un primer intento del script usó un selector inexistente
  de perfil; corregido a #profile-form, la ejecución completa pasó.
- Seis comprobaciones adicionales: Mi espacio desde cinco módulos y Centro de
  control heredado con panel de equipos. Todas correctas.
- Cuentas y auditorías temporales retiradas: cero usuarios de fixture residuales.
- Core health y Agent actual 200, log de errores Nginx vacío al verificar.
- Evidencia: `browser-results.json`, `modules-browser-results.json`,
  `home-1440.png`, `home-390.png`, logs de build/Go y `commits.json` en el directorio.

## Rollback

- Core, Activos, RH, Legal y Monitor: restaurar su `index.html` desde
  `<directorio>/<repositorio>/index.html` a `<repositorio>/dist/index.html`.
  Los assets anteriores se conservaron; las entradas y archivos referenciados
  siguen disponibles. No borrar assets durante reversión.
- Tickets: respaldo de dist en `tickets-rollback-dist`, imagen anterior en
  `tickets-rollback-image`. Restaurar ese dist en `/app/dist` del frontend o
  recrear sólo frontend usando la imagen anterior; no tocar backend ni base.
- Agent: restaurar `mrti-monitor.rollback` desde el directorio de respaldo hacia
  `bin/mrti-monitor` mediante un archivo temporal y rename. Si ya se activó la
  versión nueva, reiniciar con privilegios. Mientras no se active, su proceso
  sigue ejecutando el binario anterior.
- Código: revertir únicamente los commits indicados por repositorio y reconstruir,
  preservando las modificaciones locales ajenas. No requiere revertir datos.
