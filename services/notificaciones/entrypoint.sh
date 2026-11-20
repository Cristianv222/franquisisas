#!/bin/sh
set -e

echo "[notificaciones] aplicando migraciones..."
python manage.py migrate --noinput

exec "$@"
