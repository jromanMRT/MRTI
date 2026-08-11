-- Fase 3 de CORE_INFRA_MIGRATION_GUIDE.md: mrti_core pasa a ser propietaria
-- de identidad/permisos. Copiado del esquema real de mrti_infra
-- (migraciones 007-009 de MRTI-Infra), con una diferencia deliberada:
-- user_profiles YA NO tiene la FK hacia areas (topología física, sigue
-- siendo de Infra) — physical_area_id queda como columna simple, validada
-- por la API /api/self/* de Infra a nivel de aplicación, no por la base
-- (principio #6 de la guía: sin llaves foráneas entre módulos).

CREATE TABLE IF NOT EXISTS access_areas (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(500),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS access_area_modules (
  area_id CHAR(36) NOT NULL,
  module_code VARCHAR(50) NOT NULL,
  PRIMARY KEY (area_id, module_code),
  CONSTRAINT fk_access_area_modules_area
    FOREIGN KEY (area_id) REFERENCES access_areas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_number BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('administrator','supervisor','technician','viewer') NOT NULL DEFAULT 'viewer',
  access_area_id CHAR(36) NULL,
  physical_area_id CHAR(36) NULL,
  avatar_url TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_profiles_user_number (user_number),
  KEY idx_user_profiles_access_area (access_area_id),
  KEY idx_user_profiles_physical_area (physical_area_id),
  CONSTRAINT fk_user_profiles_access_area
    FOREIGN KEY (access_area_id) REFERENCES access_areas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
