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

## Cómo correr (dev)

> Requiere Docker y Docker Compose. Los servicios backend y las SPAs se
> construyen en los pasos 2–5 del plan; hasta entonces este esqueleto define la
> orquestación, el ruteo y las variables.

```bash
cp .env.example .env
# (en el paso 2 se generan las claves JWT en shared/jwt_keys/)
docker compose up --build
```

Una vez levantado, el gateway queda en **http://localhost:8080**:

| Ruta | Destino |
|---|---|
| `/` | SPA de franquicia (incluye el login único) |
| `/admin/` | SPA de administración |
| `/api/auth/*` | servicio `auth` |
| `/api/franquicias/*` | servicio `franquicias` |
| `/ws/*` | servicio `notificaciones` (WebSockets) |

En producción, Nginx Proxy Manager apunta a este contenedor `nginx` (puerto 8080)
y se encarga del dominio y el SSL.

## Estado

- [x] Paso 1 — Scaffolding (orquestación, nginx, Postgres, env, estructura).
- [ ] Paso 2 — Servicio `auth` (JWT RS256, usuarios, roles).
- [ ] Paso 3 — Servicio `franquicias` (modelo A, CRUD).
- [ ] Paso 4 — Servicio `notificaciones` (Channels + Daphne + Redis).
- [ ] Paso 5 — Frontends (SPAs `franquicia` y `admin`).
- [ ] Paso 6 — Integración y verificación end-to-end.
