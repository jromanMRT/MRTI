-- Expansión compatible del código de módulo: la interfaz y los contratos
-- nuevos usan mrti-obs; mrti-infra se conserva durante el periodo de rollback.
INSERT INTO access_area_modules (area_id, module_code)
SELECT area_id, 'mrti-obs'
  FROM access_area_modules
 WHERE module_code = 'mrti-infra'
ON DUPLICATE KEY UPDATE module_code = VALUES(module_code);
