-- Catálogo de recursos de marca propiedad de Core.
-- El binario vive en MySQL para que el catálogo no dependa del build del
-- frontend. "Quitar" archiva el recurso y conserva recuperación/auditoría.

CREATE TABLE IF NOT EXISTS brand_assets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  content MEDIUMBLOB NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  created_by_user_id CHAR(36) NULL,
  archived_at TIMESTAMP NULL,
  archived_by_user_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_brand_assets_visible (archived_at, sort_order, name),
  KEY idx_brand_assets_checksum (checksum_sha256),
  CONSTRAINT fk_brand_asset_creator FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_brand_asset_archiver FOREIGN KEY (archived_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conserva el recurso estático existente durante la expansión, ahora también
-- como dato de Core. El archivo público puede permanecer para rollback.
INSERT INTO brand_assets
  (id, name, description, original_filename, mime_type, file_size,
   checksum_sha256, content, sort_order)
VALUES
  ('8f2d9200-1001-4000-8000-000000000001',
   'Logotipo — color',
   'Versión principal a color, fondo transparente. Para documentos, firmas de correo y presentaciones sobre fondo claro.',
   'logo-color.svg', 'image/svg+xml', 1213,
   '864c848be6e049188c48d7f5cac8ff0e2e4d1c7b735e696f37483468927b4883',
   FROM_BASE64('PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgMTIwIiByb2xlPSJpbWciIGFyaWEtbGFiZWxsZWRieT0idGl0bGUgZGVzYyI+CiAgPHRpdGxlIGlkPSJ0aXRsZSI+RW1ibGVtYSBNUlRJPC90aXRsZT4KICA8ZGVzYyBpZD0iZGVzYyI+TW9udGHDsWFzIHkgZXN0cmF0b3MgbWluZXJhbGVzIGRlbnRybyBkZSB1biBzw61tYm9sbyBjaXJjdWxhcjwvZGVzYz4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0ib3JlIiB4MT0iMjAiIHkxPSIxMCIgeDI9Ijk4IiB5Mj0iMTA4IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiNmM2Q2OGQiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIuNDgiIHN0b3AtY29sb3I9IiNjOTk3MmYiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNmU0ZDE2Ii8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJzdG9uZSIgeDE9IjI1IiB5MT0iMzYiIHgyPSI5MSIgeTI9IjkyIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiM0YTNhMjIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMjExYTExIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogIDwvZGVmcz4KICA8Y2lyY2xlIGN4PSI2MCIgY3k9IjYwIiByPSI1NCIgZmlsbD0iI2ZmZmRmNyIgc3Ryb2tlPSJ1cmwoI29yZSkiIHN0cm9rZS13aWR0aD0iNCIvPgogIDxjaXJjbGUgY3g9IjYwIiBjeT0iNjAiIHI9IjQ1IiBmaWxsPSIjZjFlYWQ5IiBzdHJva2U9IiNlMWQzYWIiLz4KICA8cGF0aCBkPSJNMjIgNzcgNDMgNDhsMTEgMTQgMTUtMjQgMjkgMzlIMjJaIiBmaWxsPSJ1cmwoI3N0b25lKSIvPgogIDxwYXRoIGQ9Im00MyA0OCAxMSAxNCA1LTggMTAtMTYgOCAxMS04IDEzLTgtNi05IDEzLTEwLTgtMTIgMTZoLThsMjEtMjlaIiBmaWxsPSJ1cmwoI29yZSkiLz4KICA8cGF0aCBkPSJNMjUgODJjMTgtNyAzNi03IDcwIDBNMzAgOTBjMTktNSA0MC00IDYwIDFNMzkgOThjMTUtMiAyOS0yIDQzIDEiIGZpbGw9Im5vbmUiIHN0cm9rZT0idXJsKCNvcmUpIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS13aWR0aD0iMyIvPgogIDxjaXJjbGUgY3g9Ijg2IiBjeT0iMzEiIHI9IjYiIGZpbGw9IiNkOWE2M2MiLz4KPC9zdmc+Cg=='),
   10)
ON DUPLICATE KEY UPDATE id = VALUES(id);
