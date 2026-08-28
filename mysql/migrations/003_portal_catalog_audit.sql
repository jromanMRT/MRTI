-- Etapa 2 del portal empresarial: catálogo dinámico y auditoría.
-- Migración aditiva e idempotente. No reemplaza todavía los contratos
-- históricos de access_area_modules ni elimina el fallback del frontend.

CREATE TABLE IF NOT EXISTS applications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL,
  url VARCHAR(255) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Empresa',
  icon_key VARCHAR(50) NOT NULL DEFAULT 'application',
  features_json TEXT NULL,
  status ENUM('active', 'maintenance', 'inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_applications_status_order (status, sort_order, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO applications
  (id, code, name, description, url, category, icon_key, features_json, status, sort_order)
VALUES
  ('8f2d9200-0001-4000-8000-000000000001', 'mrti-obs', 'MRTI-Obs', 'Observabilidad, topología, disponibilidad y alertas de la infraestructura tecnológica.', '/mrti-obs/', 'Sistemas', 'observability', '["Monitoreo","Topología","Alertas"]', 'active', 10),
  ('8f2d9200-0002-4000-8000-000000000002', 'tickets', 'MRTI-Tickets', 'Gestión centralizada de tickets, asignaciones, prioridades y niveles de servicio.', '/tickets/', 'Empresa', 'requests', '["Tickets","Asignaciones","SLA"]', 'active', 20),
  ('8f2d9200-0003-4000-8000-000000000003', 'agent-core', 'MRTI Agent Core', 'Telemetría, estado en vivo y descargas para los agentes instalados en los equipos.', '/agent-core/', 'Sistemas', 'agents', '["Agentes","Telemetría","Alertas"]', 'active', 30),
  ('8f2d9200-0004-4000-8000-000000000004', 'activos', 'MRTI Activos', 'Inventario de activos de TI: equipos, asignaciones, licencias y accesos.', '/activos/', 'Sistemas', 'assets', '["Inventario","Asignaciones","Licencias"]', 'active', 40),
  ('8f2d9200-0005-4000-8000-000000000005', 'rh', 'MRTI RH', 'Directorio de empleados, organigrama, vacaciones y expedientes documentales.', '/rh/', 'Recursos Humanos', 'people', '["Directorio","Organigrama","Vacaciones"]', 'active', 50)
ON DUPLICATE KEY UPDATE code = VALUES(code);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id CHAR(36) NULL,
  actor_email VARCHAR(255) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(100) NULL,
  ip_address VARCHAR(64) NULL,
  metadata_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_actor_created (actor_user_id, created_at),
  KEY idx_audit_action_created (action, created_at),
  KEY idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
