# Sincronización de barra al regresar — 2026-10-25

Corrección del reporte posterior a la publicación del 24 de octubre. La clave ya era compartida, pero el estado en memoria sólo se inicializaba al cargar cada módulo. Se reprodujo antes del cambio con diez pestañas abiertas: plegar en RH dejaba Core abierto.

Los diez módulos releen la preferencia en `storage`, `focus`, `pageshow` y `visibilitychange`. Los efectos React retiran los listeners al desmontar; Core y Monitor actualizan también el botón. No se escribe la preferencia al sincronizar ni se modifica el estado del menú móvil.

## Evidencia

- Regresión antes: error «MRTI conserva el estado anterior en una pestaña abierta».
- Regresión después, sobre artefactos aislados y publicados: diez páginas simultáneas; plegado desde RH y apertura desde Agent propagados a todas. Eventos de restauración/foco/visibilidad simulados en ambas direcciones en cada módulo: 20 resultados agrupados aprobados. No se afirma restauración real desde BFCache; se probó su evento `pageshow`.
- Playwright con respuestas de API simuladas: no se modificaron cuentas ni datos reales. Evidencia en `run/sidebar-sync-20261025/regression.mjs` y `published-browser-results.json`.
- Nueve frontends compilados, Monitor compilado y suite Go aprobada; typecheck de Tickets y Obs aprobado.
- HTML/asset por Nginx 200 en ocho releases; HTML exacto en Tickets/Agent. Health global saludable.
- Publicación desde versiones vigentes más esta corrección; cambios ajenos preservados. Commits locales por repositorio, sin push.

| Repo | Commit publicado | Commit workspace | Release nuevo | Release anterior |
|---|---|---|---|---|
| MRTI | `30a62cded317` | `563addafc128` | `20261025-000247-30a62cd` | `releases/20261024-234758-763fa34` |
| MRTI-Infra | `72fa2cbf9911` | `eb5920d76ac9` | `20261025-000247-72fa2cb` | `releases/20261024-234758-72b1f3c` |
| MRTI-Tickets | `8f62c0a8b178` | `a30059acd03e` | `sidebar-sync-20261025` | `ver rollback abajo` |
| MRTI-Agent | `3e4bffad8e8d` | `3675e00d66d0` | `sidebar-sync-20261025` | `ver rollback abajo` |
| MRTI-Activos | `1e562b8d3137` | `a6ab760e8359` | `20261025-000253-1e562b8` | `releases/20261024-234805-17265b4` |
| MRTI-Admin | `c41dd8c55fa7` | `4c4db9dc35fe` | `20261025-000257-c41dd8c` | `releases/20261024-234811-38e76c1` |
| MRTI-Legal | `eca542c5cb70` | `d7f28dc984f9` | `20261025-000257-eca542c` | `releases/20261024-234812-08bf42a` |
| MRTI-Mantenimiento | `d0d82d41e9bd` | `c1b2f8e7e340` | `20261025-000258-d0d82d4` | `releases/20261024-234815-7e76c8a` |
| MRTI-RH | `a9d741059f7d` | `2bbe83429de2` | `20261025-000300-a9d7410` | `releases/20261024-234816-86e7ef5` |
| MRTI-SAP | `b53df1680ee1` | `0b78f53d130a` | `20261025-000300-b53df16` | `releases/20261024-234818-00fce26` |

## Rollback

Frontends estáticos: `node scripts/mrti-platform/release.mjs promote <ID-anterior>` desde el repositorio; utilizar el ID de la tabla sin `releases/`. Se conservaron todos los anteriores.

Tickets: etiquetar `mrti-tickets-frontend:before-sidebar-sync-20261025` como `mrti-tickets-frontend:latest`, luego `docker compose -f MRTI-Tickets/docker-compose.yml up -d --no-deps --no-build frontend` desde el workspace.

Monitor: restaurar atómicamente `bin/mrti-monitor` desde `run/sidebar-sync-20261025/mrti-monitor.before-sync`, modo 0755; enviar SIGTERM al MainPID de la unidad `mrti-monitor` para que `Restart=always` lo levante. Verificar `/healthz` y `/agent-core/`. Hash anterior en `rollback-agent.json`.

La vuelta a la versión anterior restablecería el fallo de sincronización, pero conservaría la preferencia compartida.
