#!/bin/sh
# ------------------------------------------------------------------
#  Crea una base de datos y un usuario por microservicio.
#  Corre una sola vez, al inicializar el volumen de Postgres vacío.
#  Las variables vienen del env_file (.env) del contenedor postgres.
# ------------------------------------------------------------------
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER "$AUTH_DB_USER" WITH PASSWORD '$AUTH_DB_PASSWORD';
  CREATE DATABASE "$AUTH_DB_NAME" OWNER "$AUTH_DB_USER";

  CREATE USER "$FRANQUICIAS_DB_USER" WITH PASSWORD '$FRANQUICIAS_DB_PASSWORD';
  CREATE DATABASE "$FRANQUICIAS_DB_NAME" OWNER "$FRANQUICIAS_DB_USER";

  CREATE USER "$NOTIFICACIONES_DB_USER" WITH PASSWORD '$NOTIFICACIONES_DB_PASSWORD';
  CREATE DATABASE "$NOTIFICACIONES_DB_NAME" OWNER "$NOTIFICACIONES_DB_USER";
EOSQL

echo "Bases creadas: $AUTH_DB_NAME, $FRANQUICIAS_DB_NAME, $NOTIFICACIONES_DB_NAME"
