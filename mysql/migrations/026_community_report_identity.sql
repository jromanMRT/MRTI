-- Expansión aditiva: quien escribe decide si RH ve su identidad declarada.
-- No se vincula sesión, UUID, IP ni correo al reporte.
SET @community_identity_mode_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_reports' AND COLUMN_NAME='identity_mode')=0,
  'ALTER TABLE community_reports ADD COLUMN identity_mode ENUM(''anonymous'',''identified'') NOT NULL DEFAULT ''anonymous'' AFTER body',
  'SELECT 1'
);
PREPARE community_identity_mode_statement FROM @community_identity_mode_sql;
EXECUTE community_identity_mode_statement;
DEALLOCATE PREPARE community_identity_mode_statement;

SET @community_sender_name_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_reports' AND COLUMN_NAME='sender_name')=0,
  'ALTER TABLE community_reports ADD COLUMN sender_name VARCHAR(120) NULL AFTER identity_mode',
  'SELECT 1'
);
PREPARE community_sender_name_statement FROM @community_sender_name_sql;
EXECUTE community_sender_name_statement;
DEALLOCATE PREPARE community_sender_name_statement;

SET @community_sender_location_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='community_reports' AND COLUMN_NAME='sender_location')=0,
  'ALTER TABLE community_reports ADD COLUMN sender_location VARCHAR(160) NULL AFTER sender_name',
  'SELECT 1'
);
PREPARE community_sender_location_statement FROM @community_sender_location_sql;
EXECUTE community_sender_location_statement;
DEALLOCATE PREPARE community_sender_location_statement;
