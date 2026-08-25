-- Usos configurables de los recursos de marca. Las ranuras viven en Core y
-- apuntan al catálogo sin duplicar el binario.

CREATE TABLE IF NOT EXISTS brand_appearance (
  slot VARCHAR(50) NOT NULL PRIMARY KEY,
  asset_id CHAR(36) NULL,
  updated_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_brand_appearance_asset (asset_id),
  CONSTRAINT fk_brand_appearance_asset FOREIGN KEY (asset_id) REFERENCES brand_assets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_brand_appearance_updater FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO brand_appearance (slot, asset_id)
VALUES
  ('portal_logo', '8f2d9200-1001-4000-8000-000000000001'),
  ('login_background', NULL)
ON DUPLICATE KEY UPDATE slot = VALUES(slot);
