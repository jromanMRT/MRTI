# Mapa visual de la plataforma MRTI

Este archivo es la vista humana del inventario versionado en
[`platform-map.json`](platform-map.json). El JSON es la fuente de datos: toda
edición debe mantener un propietario único por dato y respetar la guía
`CORE_INFRA_MIGRATION_GUIDE.md`.

```mermaid
flowchart TB
  people([Usuarios MRTI]) -->|sesión y portal| core[MRTI Core\nIdentidad · permisos · dashboard]
  core -->|autoservicio| rh[MRTI RH\nPersonas · organización · requisiciones]
  core -->|resumen personal| tickets[MRTI Tickets\nTickets · SLA]
  core -->|equipo asignado| assets[MRTI Activos\nInventario · asignaciones]
  core -->|áreas y dispositivos| obs[MRTI Observabilidad\nTopología · monitoreo]
  core -->|notificaciones| legal[MRTI Legal\nExpedientes · contratos]
  rh -. referencia estable .-> core
  tickets -. valida sesión .-> core
  assets -. valida sesión .-> core
  obs -->|telemetría| agent[MRTI Agent]
  maintenance[MRTI Mantenimiento\nFlota · órdenes] -->|centros de costo| sap[MRTI SAP\nConsulta SAP B1]
  public[ Sitio público ]

  classDef core fill:#b98b3f,color:#18130d,stroke:#75521e
  classDef module fill:#34443d,color:#fff,stroke:#789583
  classDef integration fill:#39455c,color:#fff,stroke:#8294b3
  class core core
  class rh,tickets,assets,obs,maintenance,legal,public module
  class sap,agent integration
```

## Cómo mantenerlo

1. Edita primero `platform-map.json`: nodos, responsabilidades y conexiones.
2. Actualiza este diagrama Mermaid para conservar una revisión visual en Git.
3. Si la modificación cruza módulos, documenta la decisión y el plan de
   compatibilidad en `CORE_INFRA_MIGRATION_GUIDE.md`.
4. No conviertas una flecha de consulta en propiedad de datos: cada dato tiene
   un solo dueño.

## Leyenda

| Tipo de relación | Significado |
|---|---|
| `auth` | El módulo valida sesión y permisos de Core. |
| `self_service` | Core compone una experiencia; el módulo dueño conserva reglas y datos. |
| `reference` | Se conserva un identificador estable, sin llave foránea entre bases. |
| `api` | Integración HTTP explícita y versionable. |
| `telemetry` | Eventos operativos provenientes de Agent. |
