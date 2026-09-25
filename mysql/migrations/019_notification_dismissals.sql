-- La campanilla de notificaciones es un "tablero en vivo" (se recalcula
-- completo en cada consulta a partir del estado actual de cada módulo, sin
-- marca de leído/no leído en ningún lado) -- por eso no había forma de
-- "quitar" una que ya se revisó. Esta tabla guarda, por usuario, qué avisos
-- decidió descartar explícitamente, para que /api/portal/v1/notifications
-- los excluya hasta que cambien de verdad (ver dismissKeyFor en
-- notificationDismissals.js: la llave combina id + kind cuando existe, así
-- que un aviso que escala -- por ejemplo de "asignado" a "SLA vencido" --
-- vuelve a aparecer aunque el ticket sea el mismo).
CREATE TABLE IF NOT EXISTS notification_dismissals (
  user_id CHAR(36) NOT NULL,
  dismiss_key VARCHAR(190) NOT NULL,
  dismissed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, dismiss_key),
  CONSTRAINT fk_notification_dismissals_user
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
