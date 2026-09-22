# Navegación a Dashboard y sesión en el home — 2026-09-22

## Comportamiento

- La ruta personal es `/dashboard`; `/mi-espacio` y `/mi-espacio/` redirigen
  conservando parámetros y fragmento. La marca de regreso a Core lleva a `/`.
- Dashboard está junto al selector de módulos en los encabezados actualizados.
- El home y el detalle de noticia incluyen nombre de cuenta y **Cerrar sesión**.
  Se conserva el selector de mosaicos y el contenido editorial actual encontrado
  en el workspace; los cambios ajenos de home, noticias y RH no se sobrescribieron
  ni se incluyeron en los commits de esta tarea.
- Al cerrar sesión se eliminan inmediatamente auth_token/auth_profile, se solicita
  POST /api/auth/logout y se vuelve a `/`, donde aparece Iniciar sesión.
  La solicitud tiene timeout de cinco segundos; su fallo no impide el cierre local.
  El backend existente audita el cierre, sin introducir un mecanismo nuevo de
  revocación JWT. El perfil local se usa únicamente como texto de presentación.
- Controles responsivos; los encabezados nativos estrechos distribuyen sus acciones
  en más de una fila cuando es necesario para evitar encimarse.

Sin migración de base, cambio de API, secretos o paquetes. Expansión compatible de
rutas, repetible sin escrituras de datos de negocio.

## Commits y publicación

MRTI `d3f38ba`; MRTI-Activos `bfe254c`; MRTI-RH `fe5a827`; MRTI-Legal `cb0f09d`; MRTI-Infra `a7e9547`; MRTI-Tickets `0b76d30`; MRTI-Agent `36e894f`.

Core y los módulos web publicados. Agent tiene el binario actualizado instalado,
pero su reinicio continúa pendiente: sudo no interactivo fue rechazado por el
sistema operativo. El proceso existente no fue detenido. Para activarlo:
`sudo systemctl restart mrti-monitor.service`.

## Evidencia

- Autenticación publicada: 13/13 contratos aprobados, sin cambio de backend.
- Rutas: 28 comprobaciones previas en escritorio/móvil; navegación: 39 checks
  en 1440/390/320 px, incluidos destinos de marca y Dashboard. Los primeros
  intentos del script de navegación necesitaron acotar una marca duplicada y
  consultar el enlace de sidebar fuera de pantalla; no fueron fallos del producto.
- Tras incorporar los cambios editoriales ya presentes: seis escenarios reales
  del cierre de sesión en 1440/390/320 px, respuesta 204, vuelta al home,
  protección de dashboard, cierre desde noticia y API fallida con limpieza local.
  Selector de módulos funcional y controles dentro del viewport.
- Corrección adicional de encabezados nativos a 320 px: pruebas geométricas de
  colisión entre navegación y botones en Activos, Legal, Monitor y Tickets.
- Seis builds web y Go test/build correctos. Sintaxis y diff correctos.
- Home y health Core 200, error.log de Nginx vacío. Cuentas y auditoría QA
  retiradas con cero fixtures residuales; no se crearon noticias ni configuraciones.
- El intento de navegador del binario QA Agent no contó con sesión y redirigió
  a login: no se declara validación visual de Agent. El proceso QA aislado en
  127.0.0.1:18477 fue detenido, sin afectar producción.

Evidencia de navegación y builds en `/tmp/mrti-dashboard-nav-tkqqw_fx`;
cierre de sesión y capturas en `/tmp/mrti-home-session-m19dzb62`.

## Rollback

Core: restaurar `/tmp/mrti-home-session-m19dzb62/index.html` en
`MRTI/dist/index.html` para deshacer sólo el cierre de sesión; los assets previos
permanecen disponibles. Para revertir también Dashboard/navegación, usar
`/tmp/mrti-dashboard-nav-tkqqw_fx/MRTI/index.html`.

Activos, RH, Legal y Monitor: restaurar `index.html` desde el subdirectorio del
repositorio en `/tmp/mrti-dashboard-nav-tkqqw_fx`; se conservaron los assets.
Si hubo cambios externos posteriores en RH/Core, usar el respaldo que corresponda
al estado deseado sin reconstruir desde HEAD sobre esas modificaciones.

Tickets: dist anterior en `tickets-rollback-dist` e ID de imagen en
`tickets-rollback-image`, dentro de ese directorio; restaurar sólo frontend.
Agent: `mrti-monitor.rollback` en ese directorio conserva el binario anterior
preparado; el respaldo de la versión publicada previamente sigue en
`/tmp/mrti-root-home-a6tj38ut/mrti-monitor.rollback`. Un cambio de proceso exige
reinicio administrativo. No hay datos que revertir.
