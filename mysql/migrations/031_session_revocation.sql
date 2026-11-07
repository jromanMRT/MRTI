-- Additive, repeatable: preserve UUIDs and legacy JWTs until explicitly revoked.
SET @has_session_version = (SELECT COUNT(*) FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'session_version');
SET @ddl = IF(@has_session_version = 0,
 'ALTER TABLE user_profiles ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE session_ddl FROM @ddl; EXECUTE session_ddl; DEALLOCATE PREPARE session_ddl;
CREATE TABLE IF NOT EXISTS revoked_session_tokens (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 expires_at DATETIME NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_revoked_session_expiry (expires_at)
);
