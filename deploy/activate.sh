#!/usr/bin/env bash
set -Eeuo pipefail

readonly SOURCE_CONFIG="/var/www/mrt/MRTI/Core/deploy/nginx.conf.example"
readonly TARGET_CONFIG="/etc/nginx/sites-available/it-infra"
readonly BACKUP_CONFIG="/etc/nginx/sites-available/it-infra.bak"

if [[ ${EUID} -ne 0 ]]; then
  echo "Este activador necesita permisos administrativos." >&2
  echo "Ejecuta: sudo $0" >&2
  exit 1
fi

if [[ ! -f /var/www/mrt/MRTI/Core/dist/index.html ]]; then
  echo "No existe el build de MRTI Core en Core/dist/." >&2
  exit 1
fi

if [[ ! -f /var/www/mrt/MRTI/IT-Management/dist/index.html ]]; then
  echo "No existe el build de IT Management en IT-Management/dist/." >&2
  exit 1
fi

if [[ -f "$TARGET_CONFIG" ]]; then
  cp --preserve=mode,ownership,timestamps "$TARGET_CONFIG" "$BACKUP_CONFIG"
fi
cp "$SOURCE_CONFIG" "$TARGET_CONFIG"

if ! nginx -t; then
  echo "La validación falló; se restaurará la configuración anterior." >&2
  if [[ -f "$BACKUP_CONFIG" ]]; then
    cp "$BACKUP_CONFIG" "$TARGET_CONFIG"
    nginx -t
  fi
  exit 1
fi

systemctl reload nginx

echo "MRTI Core quedó publicado en http://192.168.1.203/"
echo "IT Management continúa en http://192.168.1.203/it-management/"
