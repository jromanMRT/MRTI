# Aplicación móvil de MRTI

Core publica una aplicación web progresiva (PWA) que utiliza la misma sesión,
rutas y permisos del portal. No existe una segunda aplicación ni una copia de
los datos.

## Capacidades incluidas

- Instalación desde Android, iPhone y navegadores de escritorio compatibles.
- Apertura independiente, sin la barra normal del navegador.
- Pantalla de contingencia cuando el dispositivo pierde la red interna.
- Contador y notificaciones del sistema derivados de la campanilla de Core
  mientras la aplicación permanece activa; el sistema operativo puede
  suspender la actualización cuando queda en segundo plano.
- Captura directa con la cámara frontal para la foto de perfil, además del
  selector de archivos existente.

El `service worker` nunca almacena respuestas de `/api/*` ni de los prefijos
`*-api/`. Sólo conserva la interfaz estática y la pantalla sin conexión; los
datos personales siempre se solicitan nuevamente a los servicios propietarios.

## Requisito pendiente: HTTPS confiable

El acceso actual `http://192.168.1.203` no es un contexto seguro. Los teléfonos
pueden mostrar la página, pero los navegadores bloquean ahí la instalación PWA,
el `service worker` y las notificaciones. El selector `capture` puede abrir la
cámara en algunos equipos, pero no debe tomarse como garantía sin HTTPS.

La opción recomendada es:

1. Crear un nombre DNS interno bajo un dominio controlado por la empresa, por
   ejemplo `mrti.interno.ejemplo.com`, que resuelva a `192.168.1.203` dentro de
   la red.
2. Emitir un certificado TLS confiable para ese nombre. Puede obtenerse con una
   autoridad pública usando validación DNS, sin publicar el servidor en
   Internet, o con una autoridad certificadora corporativa instalada en todos
   los teléfonos administrados.
3. Añadir a Nginx un servidor en `443 ssl`, conservar todos los `location`
   actuales y redirigir el puerto 80 al nombre HTTPS.
4. Probar login, módulos, cámara, instalación y permiso de notificaciones desde
   al menos un Android y un iPhone reales.

No se debe usar un certificado autofirmado aislado: mientras el teléfono no
confíe en su autoridad emisora, el navegador seguirá mostrando advertencias y
las capacidades seguras pueden permanecer bloqueadas.

## Alternativa temporal para Windows sin HTTPS

En PCs administradas por la empresa, Chrome y Edge permiten declarar un origen
HTTP heredado como contexto confiable mediante una política del navegador. MRTI
publica dos herramientas desde **Perfil → Aplicación y notificaciones**:

- `preparar-notificaciones-mrti-windows.cmd` agrega únicamente
  `http://192.168.1.203/` a `OverrideSecurityRestrictionsOnInsecureOrigin` y
  `NotificationsAllowedForUrls` de Chrome y Edge.
- `revertir-notificaciones-mrti-windows.cmd` busca y elimina únicamente las
  entradas cuyo valor sea ese origen.

La herramienta solicita permisos de administrador, no cambia la configuración
global de notificaciones y no cierra procesos. Después de ejecutarla se deben
cerrar todas las ventanas de Chrome y Edge, abrir de nuevo MRTI y pulsar
**Activar notificaciones**. Las políticas pueden comprobarse en
`chrome://policy` o `edge://policy`.

Esta excepción reduce la protección del navegador exclusivamente para MRTI y
debe usarse sólo en PCs corporativas dentro de la red controlada. HTTPS sigue
siendo la solución definitiva y necesaria para teléfonos no administrados.

Sin esa preparación, el modo HTTP conserva un respaldo de aplicación: al
activar avisos internos, una novedad reproduce un sonido, actualiza el título de
la pestaña y muestra una tarjeta sobre MRTI. Si la ventana está minimizada, el
sonido y el título pueden continuar, pero Windows no mostrará una ventana del
sistema hasta que el navegador trate el origen como confiable.

## Notificaciones con la aplicación cerrada

La etapa actual convierte las novedades que Core ya consulta cada minuto en
avisos del dispositivo. Para entregar avisos cuando la aplicación esté
completamente cerrada se necesita una etapa adicional:

- suscripciones Web Push por usuario y dispositivo;
- llaves VAPID protegidas fuera del repositorio;
- eventos emitidos por Tickets, RH y Legal hacia Core;
- reintentos, vencimiento de suscripciones y auditoría;
- política de contenido para no incluir datos sensibles en la pantalla
  bloqueada.

No se almacenan tokens del usuario en el `service worker` y no se añadió un
sondeo en segundo plano que eluda la sesión de Core.

## Verificación y rollback

Construcción y publicación:

```bash
cd /var/www/mrt/MRTI/MRTI
npm run build
```

Comprobar que `/manifest.json`, `/sw.js`, `/offline.html` y `/` respondan `200`.
Para revertir antes de un commit, retirar los enlaces PWA de `index.html`, el
registro y controles móviles de `src/main.js`, sus estilos y los cuatro archivos
de `public/`; después reconstruir. No hay migraciones ni datos persistentes que
revertir.
