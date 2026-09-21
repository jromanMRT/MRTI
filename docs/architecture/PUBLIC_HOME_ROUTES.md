# Acceso e información empresarial — 2026-09-21

Rutas publicadas en el mismo origen:

- `/`: login sin sesión; Mi espacio con sesión vigente, compatible con enlaces existentes.
- `/home` y `/home/`: información empresarial accesible con o sin sesión.
- Los enlaces entre ambas páginas usan navegación nativa; recarga, Atrás y Adelante conservan el destino.
- `returnTo`, permisos, cambio obligatorio de contraseña y cierre de sesión mantienen el flujo de Core.

La presentación pública vive en `src/public-home.js` y `src/public-home.css`.
Consume la API de noticias que ya estaba activa (`/api/portal/v1/company-news`).
El editor, backend y migraciones de noticias encontrados como cambios locales
se preservaron sin incluirlos en este commit. La publicación conserva esos cambios
que ya formaban parte de la plataforma. El módulo público muestra un error si
esa API no está disponible; no inventa información empresarial.

No hay migración de datos: expansión aditiva de rutas; Nginx ya tiene fallback
hacia index.html. Publicación repetible copiando assets y reemplazando index.html
al final, sin borrar assets previos ni reiniciar APIs.

## Verificación

- `node --check src/main.js` y `node --check src/public-home.js`: correctos.
- `CONTRACT_TEST_URL=http://192.168.1.203 node --test test/auth-contract.test.js`
  desde server: 13/13 contratos reales aprobados.
- `npm run build -- --outDir /tmp/mrti-home-build`: correcto.
- `git diff --check`: correcto.
- Chromium sobre la IP publicada, anchos 1440 y 390: 14 escenarios aprobados
  (login inicial, navegación/recarga/responsive, login real, home con sesión,
  logout, returnTo y sesión expirada). Sin errores JavaScript ni overflow móvil.
- Atrás/Adelante y `/home/` verificados. Cuenta temporal y auditoría retiradas,
  cero usuarios de prueba residuales. No se crearon noticias.
- API pública de noticias 200 (0 publicaciones), health Core 200;
  error.log de Nginx sin contenido al terminar.
- Evidencia local: `/tmp/mrti-home-browser-results.json`,
  `/tmp/mrti-home-1440.png`, `/tmp/mrti-home-390.png`.
- No se cambiaron dependencias, configuración Nginx, secretos ni servicios.

## Rollback

Respaldo previo completo: `/tmp/mrti-home-rollback-5lwqz91s/dist`.
Restaurar su `index.html` en `MRTI/dist/index.html`; los assets previos se
conservaron y todos los archivos del respaldo siguen disponibles.
Para revertir código, revertir el commit de rutas conservando los cambios locales
del editor de noticias y reconstruir el frontend. Sin reversión de datos.
