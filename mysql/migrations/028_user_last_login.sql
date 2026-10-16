-- Expansión aditiva e idempotente: conserva perfiles y UUID existentes.
SET @last_login_column_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'user_profiles'
     AND COLUMN_NAME = 'last_login_at') = 0,
  'ALTER TABLE user_profiles ADD COLUMN last_login_at DATETIME NULL AFTER is_active',
  'SELECT 1'
);
PREPARE last_login_column_statement FROM @last_login_column_sql;
EXECUTE last_login_column_statement;
DEALLOCATE PREPARE last_login_column_statement;

-- Backfill from existing audit events
UPDATE user_profiles u
  JOIN (
    SELECT actor_user_id, MAX(created_at) AS last_login
      FROM audit_events
     WHERE action = 'session.login_succeeded'
     GROUP BY actor_user_id
  ) a ON a.actor_user_id = u.id
SET u.last_login_at = a.last_login;
