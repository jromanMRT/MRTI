-- Preferencias personales del dashboard de Core. El usuario es el único
-- propietario de su configuración y los valores tienen defaults seguros.

CREATE TABLE IF NOT EXISTS user_workspace_preferences (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  theme ENUM('system', 'light', 'dark') NOT NULL DEFAULT 'system',
  density ENUM('comfortable', 'compact') NOT NULL DEFAULT 'comfortable',
  show_notifications TINYINT(1) NOT NULL DEFAULT 1,
  show_rh TINYINT(1) NOT NULL DEFAULT 1,
  show_assets TINYINT(1) NOT NULL DEFAULT 1,
  show_tickets TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_workspace_preferences_user
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
