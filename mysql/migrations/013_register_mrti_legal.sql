-- 013: registra MRTI Legal en el catálogo dinámico de aplicaciones.
-- ON DUPLICATE KEY UPDATE code=VALUES(code) hace esta inserción idempotente
-- (mismo patrón que 003_portal_catalog_audit.sql).
INSERT INTO applications
  (id, code, name, description, url, category, icon_key, features_json, status, sort_order)
VALUES
  ('8f2d9200-0006-4000-8000-000000000006', 'mrti-legal', 'MRTI Legal',
   'Expedientes legales, documentación jurídica confidencial, versiones, permisos y vencimientos de contrato.',
   '/mrti-legal/', 'Legal', 'legal', '["Expedientes","Documentos","Vencimientos"]', 'active', 60)
ON DUPLICATE KEY UPDATE code = VALUES(code);
