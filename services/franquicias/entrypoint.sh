#!/bin/sh
set -e

echo "[franquicias] aplicando migraciones..."
python manage.py migrate --noinput

exec "$@"
