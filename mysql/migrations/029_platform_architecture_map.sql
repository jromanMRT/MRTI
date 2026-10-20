CREATE TABLE IF NOT EXISTS platform_architecture_maps (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  map_json JSON NOT NULL,
  updated_by_user_id CHAR(36) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO platform_architecture_maps (id, map_json) VALUES
(1, JSON_OBJECT('version', 1, 'title', 'Mapa de plataforma MRTI',
  'nodes', JSON_ARRAY(
    JSON_OBJECT('id','core','label','MRTI Core','kind','module','owner','Core','status','active','responsibilities',JSON_ARRAY('identidad','sesiones','permisos','portal')),
    JSON_OBJECT('id','rh','label','MRTI RH','kind','module','owner','RH','status','active','responsibilities',JSON_ARRAY('personas','organización','requisiciones')),
    JSON_OBJECT('id','tickets','label','MRTI Tickets','kind','module','owner','TI','status','active','responsibilities',JSON_ARRAY('tickets','SLA')),
    JSON_OBJECT('id','assets','label','MRTI Activos','kind','module','owner','TI','status','active','responsibilities',JSON_ARRAY('inventario','asignaciones')),
    JSON_OBJECT('id','obs','label','MRTI Observabilidad','kind','module','owner','TI','status','active','responsibilities',JSON_ARRAY('topología','monitoreo')),
    JSON_OBJECT('id','legal','label','MRTI Legal','kind','module','owner','Legal','status','active','responsibilities',JSON_ARRAY('expedientes','contratos')),
    JSON_OBJECT('id','sap','label','MRTI SAP','kind','integration','owner','Finanzas','status','active','responsibilities',JSON_ARRAY('consulta SAP B1')),
    JSON_OBJECT('id','maintenance','label','MRTI Mantenimiento','kind','module','owner','Operación','status','active','responsibilities',JSON_ARRAY('flota','órdenes')),
    JSON_OBJECT('id','agent','label','MRTI Agent','kind','agent','owner','TI','status','active','responsibilities',JSON_ARRAY('telemetría'))
  ), 'edges', JSON_ARRAY(
    JSON_OBJECT('from','core','to','rh','type','self_service','label','autoservicio RH'),
    JSON_OBJECT('from','core','to','tickets','type','self_service','label','resumen personal'),
    JSON_OBJECT('from','core','to','assets','type','self_service','label','equipo asignado'),
    JSON_OBJECT('from','core','to','obs','type','api','label','áreas y dispositivos'),
    JSON_OBJECT('from','core','to','legal','type','self_service','label','notificaciones'),
    JSON_OBJECT('from','obs','to','agent','type','telemetry','label','eventos'),
    JSON_OBJECT('from','maintenance','to','sap','type','api','label','centros de costo')
  )
));
