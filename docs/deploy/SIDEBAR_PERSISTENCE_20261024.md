# Barra lateral compartida — publicación 2026-10-24

Autorización: «publicalo por favor». Preferencia de presentación local al navegador y origen, clave `mrti_sidebar_collapsed` (`1` plegada, `0` abierta). Sin cambios de datos, autenticación ni permisos. No se hizo push.

Se construyó cada artefacto desde la versión publicada más el cambio de clave. Se conservaron los cambios ajenos del workspace; Mantenimiento y Monitor usaron sus bases publicadas anteriores al HEAD actual. Los commits de fuente del workspace contienen exclusivamente el mismo ajuste.

## Versiones

| Repositorio | Commit publicado | Commit del workspace | Release / artefacto | Anterior |
|---|---|---|---|---|
| MRTI | `763fa34fdb82` | `0834044184bb` | `20261024-234758-763fa34` | `releases/20261021-091254-5c34fb7` |
| MRTI-Infra | `72b1f3c75639` | `3e6371fdf668` | `20261024-234758-72b1f3c` | `releases/20261021-132123-12c3692` |
| MRTI-Tickets | `98a93c0f7757` | `d307cd1e3537` | `mrti-tickets-frontend:sidebar-20261024` | `mrti-tickets-frontend:before-sidebar-20261024` |
| MRTI-Agent | `8fa8e6266229` | `8b4a5890f1f9` | `bin/mrti-monitor` | `run/sidebar-publish-20261024/mrti-monitor.before-sidebar` |
| MRTI-Activos | `17265b496af1` | `10b4868af46d` | `20261024-234805-17265b4` | `releases/20261021-132134-8c5ef30` |
| MRTI-Admin | `38e76c1ed232` | `1fcfc334657c` | `20261024-234811-38e76c1` | `releases/20261021-132342-e64c879` |
| MRTI-Legal | `08bf42ad5c05` | `a21d3de88a6a` | `20261024-234812-08bf42a` | `releases/20261021-132137-d13625b` |
| MRTI-Mantenimiento | `7e76c8a0766d` | `50df931d6499` | `20261024-234815-7e76c8a` | `releases/20261020-095551-eb959d6` |
| MRTI-RH | `86e7ef5ec396` | `09c0dea19587` | `20261024-234816-86e7ef5` | `releases/20261021-132345-4c25d8f` |
| MRTI-SAP | `00fce261301e` | `b8028845ad1e` | `20261024-234818-00fce26` | `releases/20261021-091322-319db05` |

## Validación

- Ocho builds de releases estáticos y build Vite de Tickets aprobados. Monitor compilado y `go test ./cmd/mrti-monitor` aprobado.
- Smoke por Nginx: HTML exacto y script principal HTTP 200 en los ocho releases; Tickets HTML exacto; Monitor HTML idéntico al anterior salvo las dos referencias a la clave.
- Playwright contra los bundles publicados con APIs simuladas (sin modificar cuentas ni datos): plegar en RH, recorrer los diez módulos y recargar cada uno; abrir desde Agent y recorrer los diez nuevamente. 20 resultados aprobados. No se afirma una prueba de sesión autenticada real.
- `node MRTI-Platform/bin/health.mjs`: plataforma saludable, incluidos Tickets y Monitor.
- Evidencia: `run/sidebar-publish-20261024/plans.json`, `published.json`, `published-browser-results.json`, logs de compilación, manifiestos de releases y `rollback-agent.json`.

## Rollback

- Frontends estáticos: desde cada repositorio, `node scripts/mrti-platform/release.mjs promote <ID-anterior>` usando el ID de la tabla sin `releases/`. Verifica HTML y asset y revierte automáticamente si falla el smoke. Los releases anteriores se conservaron.
- Tickets: desde el workspace, `docker tag mrti-tickets-frontend:before-sidebar-20261024 mrti-tickets-frontend:latest` seguido de `docker compose -f MRTI-Tickets/docker-compose.yml up -d --no-deps --no-build frontend`. La imagen anterior permanece etiquetada; backend y base no se recrean.
- Monitor: copiar el binario de respaldo a un temporal en `bin/`, dar modo 0755 y reemplazar atómicamente `bin/mrti-monitor`; terminar con SIGTERM únicamente el MainPID de `mrti-monitor`. La unidad existente tiene `Restart=always` y lo levanta después de 5 segundos. Comprobar `/healthz` en 8477 y `/agent-core/` por Nginx.
- La nueva clave local puede permanecer durante rollback; no toca datos del servidor.
