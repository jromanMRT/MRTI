# Límites de servicios de la plataforma MRTI

- Estado: vigente
- Fecha: 2026-09-30
- Complementa: `CORE_INFRA_MIGRATION_GUIDE.md` (propiedad de datos) y
  `MRTI-Platform/README.md` (piezas compartidas).

## 1. Decisión

MRTI se mantiene como **un conjunto pequeño de módulos grandes**, cada uno con
su repositorio, proceso, base de datos y frontend propios, comunicados sólo por
APIs HTTP. No se divide un módulo en microservicios más pequeños y no se
fusionan módulos en un monolito.

Motivos:

- La escala real (decenas de usuarios, cientos de activos) no requiere escalar
  piezas por separado.
- El equipo que opera la plataforma es pequeño: cada proceso nuevo agrega
  despliegue, respaldo, monitoreo y depuración.
- Los dominios actuales (identidad, observabilidad, activos, RH, tickets,
  legal, telemetría) sí son distintos: tienen dueños de datos, ritmos de
  cambio y, en el caso de Agent, tecnología diferente.

## 2. Módulos vigentes

| Módulo | Repositorio | Proceso | Base de datos |
|---|---|---|---|
| Core (identidad, portal, dashboard) | `MRTI` | `mrti-core-api` (pm2, 3005) | `mrti_core` |
| MRTI-Obs (topología, monitoreo) | `MRTI-Infra` | `mrti-obs-api` (pm2, 3002) | `mrti_infra` |
| Activos | `MRTI-Activos` | `mrti-activos-api` (pm2, 3003) | propia |
| RH | `MRTI-RH` | `mrti-rh-api` (pm2, 3004) | propia |
| Legal | `MRTI-Legal` | `mrti-legal-api` (pm2, 3006) | propia |
| Tickets | `MRTI-Tickets` | Docker (4000/4173) | contenedor propio |
| Monitor + Agent (telemetría) | `MRTI-Agent` | systemd `mrti-monitor` (8477) | SQLite propia |

## 3. Cuándo sí se crea un módulo nuevo

Se crea un módulo (repositorio, proceso y base) sólo si se cumple **al menos
una** de estas condiciones, y queda escrita en el registro de decisiones:

1. **Dueño de datos distinto.** El dominio tiene datos maestros que ningún
   módulo actual debe escribir (ejemplo: expedientes legales).
2. **Requisito de seguridad o cumplimiento distinto.** Necesita aislamiento de
   base, respaldos o retención que no deben compartirse (ejemplo: nómina, que
   sigue fuera de alcance).
3. **Despliegue o ejecución distinta.** Corre en otra máquina, otra tecnología
   o con otra disponibilidad (ejemplo: Agent en cada equipo).

No son motivos suficientes:

- "Que esté separado" o "que quede más ordenado".
- Una pantalla o reporte nuevo: va dentro del módulo dueño de los datos.
- Una integración con un sistema externo: va en el módulo que usa esos datos
  (como CONTPAQi en RH o SAP en Activos).
- Rendimiento, mientras no exista una medición que lo demuestre.

## 4. Cuándo se fusiona o se retira un módulo

Se propone fusionar un módulo con otro cuando deja de cumplir las condiciones
de la sección 3, por ejemplo si sólo lee datos de otro módulo y no tiene
datos maestros propios. La fusión sigue el mismo patrón de expandir, migrar,
verificar y retirar de la guía de migración.

## 5. Reglas de comunicación entre módulos

1. **Sólo HTTP.** Un módulo nunca consulta por SQL la base de otro, ni crea
   llaves foráneas entre bases. Guarda el identificador estable (UUID de Core,
   `asset_uid` de Activos, id de empleado de RH) y consulta la API del dueño.
2. **La sesión se reenvía, no se interpreta.** Los módulos reenvían el header
   `Authorization` a Core (`/api/auth/me`, `/api/auth/module-access/:code`)
   usando `@mrti/platform/core-auth`. Ningún módulo decodifica el JWT ni tiene
   login propio.
3. **Llamadas sin usuario.** Cuando no hay persona navegando se usa la llave de
   servicio (`X-Service-Key`) sólo en rutas que la acepten explícitamente.
4. **Degradación independiente.** Si un módulo consultado no responde, el
   consumidor responde `503` en rutas que dependen de él y `null`/lista vacía
   en datos complementarios. Nunca `500` sin manejar, nunca tumbar el login.
5. **Autoservicio separado.** Los datos propios del trabajador se exponen en
   rutas `*-self` que sólo requieren sesión válida y fuerzan la identidad.

## 6. Requisitos de un módulo nuevo

Antes de publicarlo, un módulo nuevo debe tener:

- [ ] Decisión registrada según la sección 3.
- [ ] Entrada en la matriz de propiedad de `CORE_INFRA_MIGRATION_GUIDE.md` §3.
- [ ] Código de módulo registrado en el catálogo de aplicaciones de Core.
- [ ] Base propia con migraciones idempotentes versionadas.
- [ ] `GET /api/health` que verifique su base y responda `{ ok: true }`.
- [ ] Piezas de `MRTI-Platform` sincronizadas: `core-auth` y
      `request-context` (request-id y log de acceso).
- [ ] `MRTI_CORE_URL` en su `.env.example`; sin `MRTI_INFRA_URL`.
- [ ] Pruebas de los casos de autenticación de la guía §8
      (401, 403, 503, autoservicio).
- [ ] Frontend publicado con `mrti-release` (releases y symlink), no con
      `vite build` directo sobre la carpeta servida.
- [ ] Ubicaciones de Nginx en `MRTI/deploy/nginx.conf.example` y proceso en pm2
      con `pm2 save`.
- [ ] Registro en `MRTI-Platform/config/services.json` para que el reporte de
      salud de la plataforma lo incluya.
