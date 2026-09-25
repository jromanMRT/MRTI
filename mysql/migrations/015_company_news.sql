-- Reemplaza el tablero interno (014) por un portal de noticias de la
-- empresa: visible sin sesión en la portada, gestionado sólo por
-- administradores. 014 se publicó minutos antes que esta migración y no
-- tenía filas reales, así que se reemplaza limpio en vez de migrar datos.

DROP TABLE IF EXISTS internal_post_attachments;
DROP TABLE IF EXISTS internal_posts;

CREATE TABLE IF NOT EXISTS company_news (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  author_user_id CHAR(36) NOT NULL,
  published_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  archived_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_company_news_visible (archived_at, published_at),
  CONSTRAINT fk_company_news_author FOREIGN KEY (author_user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_company_news_archiver FOREIGN KEY (archived_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Un adjunto por noticia, igual que brand_assets: el binario vive en MySQL.
CREATE TABLE IF NOT EXISTS company_news_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  news_id CHAR(36) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  content LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company_news_attachment (news_id),
  CONSTRAINT fk_company_news_attachment_news FOREIGN KEY (news_id) REFERENCES company_news(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
