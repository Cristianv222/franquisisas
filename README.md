# franquisisas

Sistema multi-franquicia con arquitectura de microservicios. Un panel de
administración gestiona las franquicias; cada franquicia tiene su propio panel y
ve únicamente sus datos y reportes.

El diseño completo está en **[PLAN.md](PLAN.md)**.

## Stack

- **Backend:** Django 6.1.2 sobre **Daphne** (ASGI), un microservicio por dominio.
- **Tiempo real:** Django Channels + Redis (WebSockets).
- **Frontend:** React + Vite — **dos SPAs** (`admin` y `franquicia`).
- **Base de datos:** PostgreSQL 16 (una base por servicio).
- **Gateway:** Nginx interno; en producción, Nginx Proxy Manager delante (dominio + SSL).
- **Orquestación:** Docker + Docker Compose.

## Microservicios

| Servicio | Rol |
|---|---|
| `auth` | Identidad, usuarios, roles y emisión/validación de JWT (RS256). |
| `franquicias` | CRUD de franquicias/sucursales y reportes (filtrados por `franquicia_id`). |
| `notificaciones` | WebSockets en tiempo real (Channels + Daphne + Redis). |

## Despliegue con Docker Compose

Requiere Docker Engine con el plugin Docker Compose y OpenSSL en el servidor.
El compose construye las SPAs como archivos estáticos. Ningún puerto se publica
al host: Nginx Proxy Manager llega al gateway por la red Docker externa
`general-net`.

```bash
git clone <URL_DEL_REPOSITORIO> franquisisas
cd franquisisas
cp .env.example .env
```

Edita `.env` y completa todos los secretos vacíos con valores independientes.
Genera cada uno con `openssl rand -hex 32`. Mantén `DEBUG=0` y el dominio real
en `ALLOWED_HOSTS`.

Genera el par JWT en el servidor; no lo guardes en el repositorio:

```bash
mkdir -p shared/jwt_keys
openssl genpkey -algorithm RSA -out shared/jwt_keys/private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in shared/jwt_keys/private.pem -pubout -out shared/jwt_keys/public.pem
chmod 600 shared/jwt_keys/private.pem
```

Nginx Proxy Manager debe estar conectado a una red Docker llamada `general-net`.
Si esa red aún no existe, créala una sola vez:

```bash
docker network create general-net
```

Valida la configuración, construye y levanta los contenedores:

```bash
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

Para desplegar una actualización:

```bash
git pull
docker compose up -d --build
```

El gateway queda disponible en la red Docker como `franqor_nginx_prod:80`:

| Ruta | Destino |
|---|---|
| `/` | SPA de franquicia (incluye el login único) |
| `/admin/` | SPA de administración |
| `/api/auth/*` | servicio `auth` |
| `/api/franquicias/*` | servicio `franquicias` |
| `/ws/*` | servicio `notificaciones` (WebSockets) |

En Nginx Proxy Manager crea un Proxy Host con:

- **Domain Names:** `franqor.fronteratech.ec`
- **Scheme:** `http`
- **Forward Hostname / IP:** `franqor_nginx_prod`
- **Forward Port:** `80`
- **Websockets Support:** activado.
- En **SSL**, solicita un certificado para el dominio y activa **Force SSL**.

En Cloudflare, el registro A `franqor` debe apuntar a `59.223.207.206` si esa es
la IP pública actual del servidor/conexión. Configura el modo SSL/TLS de
Cloudflare en **Full (strict)** una vez que NPM tenga un certificado válido. El
router debe redirigir los puertos 80 y 443 a la máquina con Nginx Proxy Manager.
El gateway de esta aplicación no publica puertos en el host.

El contenedor de NPM debe estar conectado a `general-net` en el mismo host
Docker. No uses la IP pública ni el dominio como `Forward Hostname / IP`.

## Estado

- [x] Paso 1 — Scaffolding (orquestación, nginx, Postgres, env, estructura).
- [ ] Paso 2 — Servicio `auth` (JWT RS256, usuarios, roles).
- [ ] Paso 3 — Servicio `franquicias` (modelo A, CRUD).
- [ ] Paso 4 — Servicio `notificaciones` (Channels + Daphne + Redis).
- [ ] Paso 5 — Frontends (SPAs `franquicia` y `admin`).
- [ ] Paso 6 — Integración y verificación end-to-end.
