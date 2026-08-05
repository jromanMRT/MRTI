#!/usr/bin/env bash
set -Eeuo pipefail

readonly SOURCE_CONFIG="/var/www/mrt/MRTI/MRTI/deploy/nginx.conf.example"
readonly TARGET_CONFIG="/etc/nginx/sites-available/it-infra"
readonly BACKUP_CONFIG="/etc/nginx/sites-available/it-infra.bak"

if [[ ${EUID} -ne 0 ]]; then
  echo "Este activador necesita permisos administrativos." >&2
  echo "Ejecuta: sudo $0" >&2
  exit 1
fi

if [[ ! -f /var/www/mrt/MRTI/MRTI/dist/index.html ]]; then
  echo "No existe el build de MRTI en MRTI/dist/." >&2
  exit 1
fi

if [[ ! -f /var/www/mrt/MRTI/MRTI-Infra/dist/index.html ]]; then
  echo "No existe el build de MRTI Infra en MRTI-Infra/dist/." >&2
  exit 1
fi

if [[ ! -f /var/www/mrt/MRTI/MRTI-RH/dist/index.html ]]; then
  echo "No existe el build de MRTI RH en MRTI-RH/dist/." >&2
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

echo "MRTI quedó publicado en http://192.168.1.203/"
echo "MRTI Infra continúa en http://192.168.1.203/mrti-infra/"
echo "MRTI RH quedó publicado en http://192.168.1.203/rh/"
