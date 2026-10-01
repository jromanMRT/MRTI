-- 020: registra MRTI Compras en el catálogo dinámico de aplicaciones.
-- Lectura de SAP Business One (proveedores y alerta SAT 69-B). Como toda
-- aplicación nueva, queda visible sólo para administradores hasta que se
-- asigne a un área en Centro de control. Idempotente (ON DUPLICATE KEY).
INSERT INTO applications
  (id, code, name, description, url, category, icon_key, features_json, status, sort_order)
VALUES
  ('8f2d9200-0007-4000-8000-000000000007', 'compras', 'MRTI Compras',
   'Proveedores de las empresas en SAP y alerta de contribuyentes del artículo 69-B del SAT.',
   '/compras/', 'Empresa', 'purchases', '["Alerta SAT 69-B","Proveedores"]', 'active', 70)
ON DUPLICATE KEY UPDATE code = VALUES(code);
