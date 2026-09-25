-- Permite editar una noticia existente y registrar quién y cuándo la editó
-- por última vez. Nulo hasta la primera edición (crear o reordenar no cuenta
-- como "editado").

ALTER TABLE company_news
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL AFTER sort_order,
  ADD COLUMN updated_by_user_id CHAR(36) NULL AFTER updated_at,
  ADD CONSTRAINT fk_company_news_updater FOREIGN KEY (updated_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
