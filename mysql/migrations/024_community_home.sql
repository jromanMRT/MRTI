-- Expansión aditiva: Core es dueño de participación en la portada.
CREATE TABLE IF NOT EXISTS community_settings (
 id TINYINT PRIMARY KEY,
 reports_enabled BOOLEAN NOT NULL DEFAULT TRUE,
 hourly_limit INT NOT NULL DEFAULT 5,
 daily_limit INT NOT NULL DEFAULT 20,
 global_daily_limit INT NOT NULL DEFAULT 200,
 revision INT NOT NULL DEFAULT 1
);
INSERT IGNORE INTO community_settings (id) VALUES (1);
CREATE TABLE IF NOT EXISTS community_polls (
 id CHAR(36) PRIMARY KEY,
 question VARCHAR(240) NOT NULL,
 options_json JSON NOT NULL,
 closes_at DATETIME NOT NULL,
 closed_at DATETIME NULL,
 created_by CHAR(36) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS community_votes (
 poll_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 option_index INT NOT NULL,
 PRIMARY KEY (poll_id,user_id),
 FOREIGN KEY (poll_id) REFERENCES community_polls(id)
);
-- No UUID, IP, correo, navegador ni request-id del denunciante.
CREATE TABLE IF NOT EXISTS community_reports (
 id CHAR(36) PRIMARY KEY,
 folio VARCHAR(24) NOT NULL UNIQUE,
 access_digest CHAR(64) NOT NULL,
 category VARCHAR(32) NOT NULL,
 subject VARCHAR(160) NOT NULL,
 body TEXT NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'received',
 public_reply TEXT NULL,
 revision INT NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX report_queue (status,created_at)
);
CREATE TABLE IF NOT EXISTS community_report_updates (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 report_id CHAR(36) NOT NULL,
 actor_user_id CHAR(36) NOT NULL,
 status VARCHAR(24) NOT NULL,
 internal_note TEXT NULL,
 public_reply TEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (report_id) REFERENCES community_reports(id)
);
-- Contadores independientes; HMAC diario de red, sin relación a un reporte.
CREATE TABLE IF NOT EXISTS community_rate_buckets (
 bucket_key VARCHAR(100) PRIMARY KEY,
 hits INT NOT NULL DEFAULT 0,
 expires_at DATETIME NOT NULL,
 INDEX bucket_expiration (expires_at)
);
CREATE TABLE IF NOT EXISTS community_used_challenges (
 nonce CHAR(36) PRIMARY KEY,
 expires_at DATETIME NOT NULL,
 INDEX challenge_expiration (expires_at)
);
