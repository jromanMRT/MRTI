-- Aditiva y repetible. Expande el sujeto de políticas con la capa organizacional
-- (C-1..C-6) y guarda una referencia de la capa vigente de cada cuenta. RH sigue
-- siendo el único propietario de la capa: Core sólo conserva una instantánea
-- (sin FK) obtenida de /api/rh-self/me/organizational-layer.
SET @policies_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'access_policies' AND COLUMN_NAME = 'subject_type');
SET @ddl = IF(@policies_type NOT LIKE '%layer%',
 "ALTER TABLE access_policies MODIFY subject_type ENUM('role','user','layer') NOT NULL", 'SELECT 1');
PREPARE policies_ddl FROM @ddl; EXECUTE policies_ddl; DEALLOCATE PREPARE policies_ddl;

SET @events_type = (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'access_policy_events' AND COLUMN_NAME = 'subject_type');
SET @ddl = IF(@events_type NOT LIKE '%layer%',
 "ALTER TABLE access_policy_events MODIFY subject_type ENUM('role','user','layer') NOT NULL", 'SELECT 1');
PREPARE events_ddl FROM @ddl; EXECUTE events_ddl; DEALLOCATE PREPARE events_ddl;

CREATE TABLE IF NOT EXISTS access_layer_snapshot (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  layer VARCHAR(10) NULL,
  position_id INT UNSIGNED NULL,
  position_name VARCHAR(150) NULL,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_access_layer_snapshot_layer (layer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
