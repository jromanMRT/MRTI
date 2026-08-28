-- Uniforma el nombre visible del módulo de mesa de servicio.
-- La condición por código mantiene la migración idempotente y evita afectar
-- aplicaciones ajenas que utilicen la palabra "solicitudes".

UPDATE applications
SET name = 'MRTI-Tickets',
    description = 'Gestión centralizada de tickets, asignaciones, prioridades y niveles de servicio.',
    features_json = '["Tickets","Asignaciones","SLA"]'
WHERE code = 'tickets';
