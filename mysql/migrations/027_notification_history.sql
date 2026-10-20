CREATE TABLE IF NOT EXISTS notification_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  notification_id VARCHAR(190) NOT NULL,
  kind VARCHAR(60) NULL,
  module_code VARCHAR(30) NULL,
  title VARCHAR(255) NOT NULL,
  message VARCHAR(500) NULL,
  href VARCHAR(500) NULL,
  metadata_json JSON NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notification_history_user (user_id, archived_at),
  UNIQUE KEY uq_notification_history_item (user_id, notification_id, kind),
  CONSTRAINT fk_notification_history_user
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
