-- Expansión compatible. No cambia roles, UUID ni áreas existentes.
CREATE TABLE IF NOT EXISTS access_policies (
  subject_type ENUM('role','user') NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  policy_json JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by CHAR(36) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (subject_type, subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS access_policy_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subject_type ENUM('role','user') NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  before_json JSON NOT NULL,
  after_json JSON NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_access_policy_events_subject (subject_type, subject_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
