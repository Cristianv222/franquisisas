#!/bin/sh
set -e

echo "[auth] aplicando migraciones..."
python manage.py migrate --noinput

exec "$@"
