-- 022: registra MRTI-Mantenimiento en el catálogo de aplicaciones. Dueño de
-- equipos de flota y mina, horómetros, planes preventivos y órdenes de
-- trabajo (el mantenimiento de activos de TI sigue en Activos). Como toda
-- aplicación nueva, sólo la ven administradores hasta asignarla a un área en
-- Centro de control. El nombre visible se puede cambiar ahí. Idempotente.
INSERT INTO applications
  (id, code, name, description, url, category, icon_key, features_json, status, sort_order)
VALUES
  ('8f2d9200-0008-4000-8000-000000000008', 'mantenimiento', 'Mantenimiento',
   'Equipos de flota y mina: horómetros, planes de servicio preventivo, órdenes de trabajo, disponibilidad y costo por hora con el costo de SAP.',
   '/mantenimiento/', 'Operación', 'maintenance', '["Horómetros","Planes preventivos","Órdenes de trabajo","Costo por hora"]', 'active', 80)
ON DUPLICATE KEY UPDATE code = VALUES(code);
