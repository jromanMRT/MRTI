-- Las cuentas aprovisionadas desde RH reciben una contraseña aleatoria de un
-- solo uso y deben reemplazarla antes de continuar en el portal.

SET @password_change_column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'user_profiles'
     AND COLUMN_NAME = 'password_change_required'
);
SET @password_change_column_sql = IF(
  @password_change_column_exists = 0,
  'ALTER TABLE user_profiles ADD COLUMN password_change_required TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash',
  'SELECT 1'
);
PREPARE password_change_column_stmt FROM @password_change_column_sql;
EXECUTE password_change_column_stmt;
DEALLOCATE PREPARE password_change_column_stmt;
