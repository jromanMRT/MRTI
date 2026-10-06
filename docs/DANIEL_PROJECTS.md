# Acceso a los proyectos de Daniel

Fecha: 2026-10-02. Alcance solicitado: agregar un botón para explorar el
dashboard existente; todas las funciones actuales permanecen disponibles.

## Implementación

`/dashboard?view=daniel-projects` se abre desde Acciones rápidas o el menú
lateral de Core. Reutiliza `ABRIR-PROYECTOS.html` y sus 28 páginas enlazadas
en `../Applicaciones_Daniel/PROYECTOS`, sin copiar ni modificar los originales.
El directorio se puede configurar con `DANIEL_PROJECTS_DIR` en la API.

Core entrega únicamente los HTML enumerados en `danielProjectFiles.json`,
como JSON, mediante `GET /api/portal/v1/daniel-projects` y
`GET /api/portal/v1/daniel-projects/content?file=...`. Ambas rutas exigen
sesión y administrador, dado que hay prototipos con datos laborales y salariales.
Las rutas pasan por el proxy existente de Nginx; no se publica la carpeta
completa ni se requiere modificar Nginx o conceder acceso al filesystem.

Los prototipos se ejecutan en un iframe sandbox sin `allow-same-origin` ni
navegación de la ventana superior. No reciben tokens de Core. Un adaptador
de almacenamiento conserva sólo los valores del prototipo en una clave por
usuario y archivo; no comparte las claves de sesión del portal. No se conecta
ningún prototipo con las bases operativas. Las carpetas de código sin HTML
ejecutable se identifican como tales. Las dependencias CDN requieren internet;
las versiones originales pueden conservar errores propios del respaldo.

No aplica migración de datos: es lectura de archivos existentes y una ampliación
de navegación. Repetir la publicación no modifica usuarios, catálogo o datos.

## Plan y comprobación

- Implementación: terminada.
- Pruebas de contrato y navegador: terminadas.
- Publicación y smoke: terminados; commit `0060d56`, release
  `20261002-151457-f315e3e-dirty` (build del mismo código antes del commit).

Prueba acotada sin base de datos ni identidades reales:
`cd server && node --test test/daniel-projects.test.js` (6/6).
Incluye 401/403, lista cerrada, formato JSON/no-store, parámetros ambiguos,
archivos faltantes y rechazo de symlinks fuera del directorio.

Chromium con identidad simulada verificó el botón, 12 tarjetas, búsqueda y
regreso en 1440/390 px, apertura de las 10 aplicaciones principales, aislamiento
de sesión, almacenamiento separado, regreso a Inicio y Nuevo ticket. Cero
errores JavaScript. Las 29 páginas (dashboard + 28 enlaces) respondieron 200.
Evidencia local: `../run/daniel-projects-20261002/browser-results.json` y
`browser.mjs`. No se crearon cuentas, datos ni tablas de prueba en producción.
Build Vite, `node --check` y `git diff --check` aprobados.

Smoke publicado por Nginx: dashboard y bundle 200; catálogo y contenido sin
sesión 401; token inválido 401. Health de Core 200 y PM2 online tras reinicio.
La apertura autenticada se probó con identidad simulada en servidor aislado;
no se usó ni creó una cuenta productiva. No cambiaron dependencias.

## Publicación y rollback

Publicar el frontend con el flujo de releases de Core y reiniciar únicamente
`mrti-core-api` para montar las rutas nuevas. Antes del cambio, el frontend
publicado es `20261001-091649-20cf19d`.

Rollback: `npm run release:promote -- 20261001-091649-20cf19d` y revertir el
commit de esta función, seguido de `pm2 restart mrti-core-api`. No hay tablas,
identificadores ni datos que restaurar; los HTML originales quedan intactos.
Las claves locales `mrti_daniel_project:*` pueden conservarse para reactivar
la vista posteriormente. No se hace push.

## Retiro — 2026-10-06

A petición del usuario, el visor se retira: lo valioso de los prototipos quedó
integrado en MRTI-RH (ver `MRTI-RH/docs/EVALUACION_APLICACIONES_DANIEL.md`) y
la carpeta `Applicaciones_Daniel` sale del árbol de MRTI hacia
`/home/mrtcorporativo/archivo/Applicaciones_Daniel` (fuera de `/var/www`,
porque contiene datos laborales y salariales incrustados).

Se eliminan el enlace del menú, la acción rápida, la vista
`?view=daniel-projects` (un marcador viejo abre el dashboard normal), las rutas
`/api/portal/v1/daniel-projects*`, su lista cerrada y su prueba. No hay datos ni
tablas involucradas.

Publicación: release de Core y reinicio de `mrti-core-api` para desmontar las
rutas. Mientras no se reinicie, las rutas viejas responden 404 "no disponible"
porque la carpeta ya no está en la ruta configurada.
Rollback: `git revert` de este commit, publicar y reiniciar; para volver a
servir los archivos, `DANIEL_PROJECTS_DIR=/home/mrtcorporativo/archivo/Applicaciones_Daniel/PROYECTOS`.
