-- 021: el módulo de lectura de SAP (código 'compras') pasa a llamarse
-- MRTI-SAP y se muestra como "SAP". El nombre visible vive sólo aquí, en el
-- catálogo, y se puede cambiar desde Centro de control → Aplicaciones; el
-- módulo lo lee de /api/portal/v1/applications. El código, la URL /compras/ y
-- los permisos por área no cambian. Idempotente y sólo toca los valores que
-- siguen siendo los de la 020, para no pisar un nombre editado a mano.
UPDATE applications SET name = 'SAP'
  WHERE code = 'compras' AND name = 'MRTI Compras';
UPDATE applications SET description = 'MRTI-SAP: lectura de SAP Business One. Resumen para dirección, seguimiento de compras, pagos y saldos con proveedores, presupuesto, inventario, flota y alerta SAT 69-B.'
  WHERE code = 'compras' AND description = 'Proveedores de las empresas en SAP y alerta de contribuyentes del artículo 69-B del SAT.';
UPDATE applications SET features_json = '["Resumen ejecutivo","Seguimiento de compras","Pagos y saldos","Presupuesto","Inventario","Flota y equipo","Alerta SAT 69-B","Proveedores"]'
  WHERE code = 'compras' AND features_json = '["Alerta SAT 69-B","Proveedores"]';
