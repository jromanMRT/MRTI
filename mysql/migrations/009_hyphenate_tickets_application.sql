-- Conserva exactamente el nombre canónico solicitado después de que la
-- migración 008 se aplicara inicialmente con un espacio en instalaciones vivas.

UPDATE applications
SET name = 'MRTI-Tickets'
WHERE code = 'tickets';
