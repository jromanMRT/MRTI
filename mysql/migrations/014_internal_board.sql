-- Tablero interno de Core: cualquier usuario autenticado puede publicar un
-- mensaje y, opcionalmente, adjuntar un archivo. Vive en la portada para
-- compartir información interna antes de entrar a cada módulo.

CREATE TABLE IF NOT EXISTS internal_posts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  author_user_id CHAR(36) NOT NULL,
  body TEXT NOT NULL,
  archived_at TIMESTAMP NULL,
  archived_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_internal_posts_visible (archived_at, created_at),
  CONSTRAINT fk_internal_post_author FOREIGN KEY (author_user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_internal_post_archiver FOREIGN KEY (archived_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un adjunto por publicación: mantiene la portada simple (mensaje + un
-- archivo). El binario vive en MySQL, igual que brand_assets.
CREATE TABLE IF NOT EXISTS internal_post_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  post_id CHAR(36) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  content LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_internal_post_attachment_post (post_id),
  CONSTRAINT fk_internal_post_attachment_post FOREIGN KEY (post_id) REFERENCES internal_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
