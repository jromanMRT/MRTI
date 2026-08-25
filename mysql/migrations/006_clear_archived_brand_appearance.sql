-- Respeta recursos que ya fueron archivados antes de introducir las
-- asignaciones visuales. Nunca reactiva ni muestra un archivo retirado.

UPDATE brand_appearance appearance
LEFT JOIN brand_assets assets ON assets.id = appearance.asset_id
SET appearance.asset_id = NULL
WHERE appearance.asset_id IS NOT NULL
  AND (assets.id IS NULL OR assets.archived_at IS NOT NULL);
