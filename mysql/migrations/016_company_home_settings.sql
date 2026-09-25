-- Contenido fijo editable de la portada pública (hero + "Quiénes somos") y
-- orden manual de las noticias, para que un administrador pueda ajustar todo
-- lo que se ve en "/" sin tocar código.

CREATE TABLE IF NOT EXISTS company_home_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  hero_eyebrow VARCHAR(120) NOT NULL DEFAULT 'Portal informativo',
  hero_title VARCHAR(200) NOT NULL DEFAULT 'Minera Río Tinto.',
  hero_subtitle VARCHAR(200) NOT NULL DEFAULT 'Información para todo el personal.',
  hero_body VARCHAR(600) NOT NULL DEFAULT 'Consulta los avisos y noticias oficiales de la empresa. Inicia sesión para entrar a tus aplicaciones según tu nivel de acceso.',
  facts_json JSON NOT NULL,
  updated_by_user_id CHAR(36) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_company_home_settings_singleton CHECK (id = 1),
  CONSTRAINT fk_company_home_settings_updater FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO company_home_settings (id, facts_json)
VALUES (1, JSON_ARRAY(
  JSON_OBJECT('label', 'Fundación', 'value', '1994'),
  JSON_OBJECT('label', 'Operaciones', 'value', 'Choix, Sinaloa'),
  JSON_OBJECT('label', 'Grupo', 'value', 'Rio Tinto Plc'),
  JSON_OBJECT('label', 'Minerales', 'value', 'Oro, plata, cobre, zinc y plomo')
))
ON DUPLICATE KEY UPDATE id = id;

-- Orden manual de las noticias en la portada (antes solo por fecha).
ALTER TABLE company_news ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER published_at;

SET @rank := 0;
UPDATE company_news
   SET sort_order = (@rank := @rank + 1)
 WHERE archived_at IS NULL
 ORDER BY published_at DESC;
