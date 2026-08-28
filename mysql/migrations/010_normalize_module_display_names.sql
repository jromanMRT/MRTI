-- Los nombres de presentación usan espacios; los códigos técnicos conservan
-- sus identificadores compatibles con guion, como `mrti-obs`.

UPDATE applications
SET name = CASE code
  WHEN 'mrti-obs' THEN 'MRTI Monitor'
  WHEN 'tickets' THEN 'MRTI Tickets'
  WHEN 'agent-core' THEN 'MRTI Agent Core'
  WHEN 'activos' THEN 'MRTI Activos'
  WHEN 'rh' THEN 'MRTI RH'
  ELSE name
END
WHERE code IN ('mrti-obs', 'tickets', 'agent-core', 'activos', 'rh');
