#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
umask 077

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: instala OpenSSL antes de ejecutar este script." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker no está instalado o no está disponible en PATH." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi

missing_database_secrets=()
for key in POSTGRES_PASSWORD AUTH_DB_PASSWORD FRANQUICIAS_DB_PASSWORD NOTIFICACIONES_DB_PASSWORD; do
  value="$(sed -n "s/^${key}=//p" .env | tail -n 1)"
  if [[ -z "$value" ]]; then
    missing_database_secrets+=("$key")
  fi
done

if ((${#missing_database_secrets[@]} > 0)); then
  existing_volume="$(docker volume ls -q \
    --filter label=com.docker.compose.project=franquisisas \
    --filter label=com.docker.compose.volume=pgdata)"
  if [[ -n "$existing_volume" ]]; then
    if ! volume_state="$(docker run --rm --network none \
      --entrypoint sh \
      -v "${existing_volume}:/var/lib/postgresql/data:ro" \
      postgres:16-alpine \
      -c 'if test -s /var/lib/postgresql/data/PG_VERSION; then printf initialized; else printf empty; fi')"; then
      echo "Error: no pude comprobar el volumen PostgreSQL; no cambiaré credenciales." >&2
      exit 1
    fi
    if [[ "$volume_state" == "initialized" ]]; then
      printf 'Error: el volumen PostgreSQL %s ya contiene una base inicializada, pero faltan credenciales: %s\n' \
        "$existing_volume" "${missing_database_secrets[*]}" >&2
      echo "No generaré contraseñas nuevas porque impedirían el acceso a tus datos." >&2
      echo "Restaura primero los valores originales de .env o recupera las credenciales de PostgreSQL." >&2
      exit 1
    fi
  fi
fi

set_if_empty() {
  local key="$1"
  local value="$2"
  local current

  current="$(sed -n "s/^${key}=//p" .env | tail -n 1)"
  if [[ -z "$current" ]]; then
    if grep -q "^${key}=" .env; then
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    else
      printf '%s=%s\n' "$key" "$value" >> .env
    fi
  fi
}

for key in \
  POSTGRES_PASSWORD \
  AUTH_DB_PASSWORD \
  FRANQUICIAS_DB_PASSWORD \
  NOTIFICACIONES_DB_PASSWORD \
  REDIS_PASSWORD \
  DJANGO_SECRET_KEY; do
  set_if_empty "$key" "$(openssl rand -hex 32)"
done

if [[ -e shared/jwt_keys/private.pem || -e shared/jwt_keys/public.pem ]]; then
  if [[ ! -s shared/jwt_keys/private.pem || ! -s shared/jwt_keys/public.pem ]]; then
    echo "Error: existe solo una clave JWT o alguna está vacía; no sobrescribo claves." >&2
    echo "Revisa shared/jwt_keys y restaura el par correspondiente." >&2
    exit 1
  fi
else
  mkdir -p shared/jwt_keys
  openssl genpkey -algorithm RSA -out shared/jwt_keys/private.pem -pkeyopt rsa_keygen_bits:2048
  openssl rsa -in shared/jwt_keys/private.pem -pubout -out shared/jwt_keys/public.pem
fi

chmod 600 .env shared/jwt_keys/private.pem
chmod 644 shared/jwt_keys/public.pem

docker compose config --quiet

echo "Configuración lista: .env y claves JWT creados o completados sin mostrar secretos."
echo "Revisa que Nginx Proxy Manager comparta la red Docker general-net."
echo "Para desplegar: docker compose build && docker compose up -d"
