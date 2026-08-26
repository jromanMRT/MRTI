# Contrato de auditoría transversal

Fecha: 2026-08-26

## Objetivo

Registrar quién cambió información, cuándo, en qué módulo y sobre qué recurso,
sin trasladar la propiedad de los datos de negocio a Core.

## Propiedad y consulta

- Cada módulo conserva sus eventos en su propia base. RH, Activos y MRTI-Obs
  usan `audit_events`; Tickets conserva su tabla compatible `audit_logs`; Core
  conserva su `audit_events` existente.
- Core sólo consolida lecturas, en paralelo y con timeout. Reenvía la sesión del
  administrador a cada módulo y nunca escribe eventos en nombre de otro módulo.
- Una fuente caída no bloquea las demás: la respuesta indica el estado de cada
  fuente y la interfaz advierte cuáles no pudieron consultarse.
- No hay llaves foráneas entre bases. `actor_user_id` es una referencia estable
  al UUID de identidad de Core.

## Evento común

Las respuestas administrativas normalizan estos campos:

`id`, `module`, `actor_user_id`, `actor_name`, `actor_email`, `action`,
`entity_type`, `entity_id`, `request_id`, `ip_address`, `user_agent`,
`before`, `after`, `metadata`, `status_code` y `created_at`.

La captura genérica cubre solicitudes `POST`, `PUT`, `PATCH` y `DELETE` que
terminan con un código menor que 400. Guarda el cuerpo saneado como estado
posterior/contexto; `before` queda vacío cuando la operación no ofrece una
captura semántica previa. Las auditorías específicas existentes, como las de
Tickets y Core, pueden aportar estados anterior y posterior más precisos.

## Seguridad y límites

- Sólo el rol global `administrator` puede consultar el historial.
- La captura elimina recursivamente contraseñas, tokens, cookies, secretos,
  credenciales, llaves, RFC, CURP, NSS, salarios, datos bancarios, médicos y
  fechas de nacimiento. Los buffers se sustituyen por su longitud.
- La pantalla limita la consulta consolidada a 500 eventos y la carga inicial a
  200. Los módulos aplican sus propios límites.
- No se exponen rutas para editar o borrar eventos. Una política de retención y
  exportación inmutable debe definirse antes de hacer depuración automática.

## Operación y rollback

Las migraciones son aditivas e idempotentes. Para revertir, se restaura el
commit anterior de cada servicio, se reconstruye su frontend/backend y se
reinicia sólo ese proceso. Las tablas nuevas pueden permanecer: el código
anterior no las consulta. No se debe eliminar historial durante el rollback.

