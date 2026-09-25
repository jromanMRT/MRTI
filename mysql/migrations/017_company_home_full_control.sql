-- Amplía la portada pública para que un administrador (Core o RH) controle
-- también el encabezado de la sección de noticias y el pie de página, no
-- sólo el hero y los datos de la empresa.

ALTER TABLE company_home_settings
  ADD COLUMN news_section_eyebrow VARCHAR(120) NOT NULL DEFAULT 'Últimos avisos' AFTER facts_json,
  ADD COLUMN news_section_title VARCHAR(160) NOT NULL DEFAULT 'Noticias de la empresa' AFTER news_section_eyebrow,
  ADD COLUMN footer_tagline VARCHAR(200) NOT NULL DEFAULT 'La puerta de entrada digital de Minera Río Tinto' AFTER news_section_title;
