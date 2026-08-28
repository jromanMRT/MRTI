-- La imagen se guarda separada del perfil para que las validaciones de sesión
-- entre módulos no transporten el binario en cada solicitud.

CREATE TABLE IF NOT EXISTS user_profile_avatars (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  mime_type VARCHAR(30) NOT NULL,
  content MEDIUMBLOB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_avatar_user
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
