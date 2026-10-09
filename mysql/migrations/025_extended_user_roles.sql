-- Amplía el catálogo de roles sin retirar ni renombrar los cuatro valores
-- históricos. Las asignaciones actuales y los UUID permanecen intactos.
SET @role_type = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'role'
);
SET @expand_roles = IF(
  @role_type LIKE '%area_manager%' AND @role_type LIKE '%data_entry%'
    AND @role_type LIKE '%approver%' AND @role_type LIKE '%auditor%',
  'SELECT 1',
  "ALTER TABLE user_profiles MODIFY role ENUM('administrator','area_manager','supervisor','technician','data_entry','approver','auditor','viewer') NOT NULL DEFAULT 'viewer'"
);
PREPARE stmt FROM @expand_roles;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
