-- Fase 1 completar: columnas para vincular identidad Google con user_profiles.
-- google_sub: identificador estable de Google (nunca cambia, a diferencia del email).
-- google_refresh_token: para operaciones offline (Drive, Gmail) en fases futuras.
-- auth_provider: distingue cuentas creadas por SSO vs. registro manual.

SET @db = DATABASE();

SELECT COUNT(*) INTO @has_google_sub
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'google_sub';

SET @add_google_sub = IF(@has_google_sub = 0,
  'ALTER TABLE user_profiles ADD COLUMN google_sub VARCHAR(255) NULL AFTER password_change_required, ADD UNIQUE KEY uq_user_profiles_google_sub (google_sub)',
  'SELECT 1');
PREPARE stmt FROM @add_google_sub; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_refresh
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'google_refresh_token';

SET @add_refresh = IF(@has_refresh = 0,
  'ALTER TABLE user_profiles ADD COLUMN google_refresh_token TEXT NULL AFTER google_sub',
  'SELECT 1');
PREPARE stmt FROM @add_refresh; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_provider
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'auth_provider';

SET @add_provider = IF(@has_provider = 0,
  "ALTER TABLE user_profiles ADD COLUMN auth_provider ENUM('local','google') NOT NULL DEFAULT 'local' AFTER google_refresh_token",
  'SELECT 1');
PREPARE stmt FROM @add_provider; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- password_hash es NOT NULL, pero los usuarios SSO-only no tienen contraseña.
-- Relajamos a NULL para que JIT provisioning no necesite generar una falsa.
SELECT IS_NULLABLE INTO @pw_nullable
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'password_hash'
 LIMIT 1;

SET @relax_pw = IF(@pw_nullable = 'NO',
  'ALTER TABLE user_profiles MODIFY password_hash VARCHAR(255) NULL',
  'SELECT 1');
PREPARE stmt FROM @relax_pw; EXECUTE stmt; DEALLOCATE PREPARE stmt;
