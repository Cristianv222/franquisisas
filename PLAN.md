# Plan — Sistema de gestión de franquicias (`franquisisas`)

Sistema multi-franquicia con arquitectura de microservicios. Un panel de
administración gestiona franquicias, menús, items, materia prima e inventario;
cada franquicia tiene su propio panel, vende desde sus menús/items asignados y
ve únicamente sus datos y reportes.

---

## 1. Stack y versiones

| Pieza | Tecnología |
|---|---|
| Backend (cada microservicio) | **Django 6.1.2** (si no está ese patch, el último `6.1.x`) |
| Servidor ASGI | **Daphne** (todos los servicios corren sobre ASGI) |
| Tiempo real | **Django Channels** + **Redis** (channel layer) |
| Frontend | **React + Vite** (dos SPAs independientes) |
| Base de datos | **PostgreSQL 16** (Django 6.1 exige Postgres 15+) |
| Imágenes | **Volumen de medios** servido por nginx en `/media/` |
| Gateway interno | **Nginx** (dentro del stack) |
| Orquestación | **Docker + Docker Compose** |
| Borde (producción) | **Nginx Proxy Manager** ya existente (dominio + SSL) |

---

## 2. Arquitectura

```
                               Internet
                                  │
                                  ▼
                    Nginx Proxy Manager (producción)
                        dominio público + SSL/TLS
                                  │
                                  ▼
       ┌──────────────── NGINX interno (gateway) ────────────────────┐
       │  sirve las 2 SPAs y /media/, rutea por path, upgrade WS      │
       └──┬───────┬──────────┬───────────────┬─────────────┬─────────┘
      /    /admin/   /api/auth/   /api/franquicias/   /media/    /ws/
  franq.   admin       auth         franquicias      imágenes  notificaciones
   SPA      SPA     (Dj/Daphne)     (Dj/Daphne)      (volumen) (Channels/Daphne)
                         │                │                          │
                         ▼                ▼                          ▼
                      auth_db       franquicias_db + media         Redis
                   (Postgres 16, una base por servicio)        (channel layer)
```

En producción, Nginx Proxy Manager apunta a un **único upstream**: el contenedor
nginx interno. NPM hace dominio + SSL; el nginx interno hace todo el ruteo de la
app (versionado en el repo, idéntico en local y producción).

---

## 3. Microservicios

### 3.1 `auth` — identidad y autenticación
- Dueño del modelo de **usuario** (modelo custom) y de las **credenciales**.
- Dueño de **roles**: `admin` y `franquicia`.
- Emite y refresca **JWT con RS256** (`djangorestframework-simplejwt`):
  - Firma con la **clave privada** (solo este servicio la tiene).
  - Los demás servicios validan con la **clave pública** compartida, sin
    llamar al auth en cada request.
  - Access corto (~15 min) + refresh largo con rotación.
- Endpoints: `register` (uso interno/admin), `login`, `refresh`, `logout`, `me`.
- Expone un endpoint interno para **crear el usuario de una franquicia**.

**Claims del token:** `sub`, `role` (`admin`/`franquicia`), `franquicia_id`.

> La gestión de usuarios vive **dentro de `auth`** para evitar un modelo de
> usuario distribuido.

### 3.2 `franquicias` — dominio de negocio
Es el servicio más grande. Responsabilidades:
- **Catálogo (solo ADMIN):** menús, items, materia prima, recetas, asignación de
  menús a franquicias, carga y ajuste de inventario.
- **Operación (FRANQUICIA):** registrar ventas (que descuentan inventario), ver
  sus reportes y **enviar solicitudes** de items nuevos.
- Valida el JWT con la **clave pública** (middleware), autoriza por rol y por
  `franquicia_id`.
- Guarda **imágenes** (items, solicitudes) en el volumen `/media`.

### 3.3 `notificaciones` — tiempo real (WebSockets)
- Django + **Channels** + **Daphne**, con **Redis** como channel layer.
- Consumer WS **autenticado por JWT**. Base para avisos en vivo (stock bajo,
  nueva solicitud, etc.).

---

## 4. Modelo de datos

**Una base por servicio** (`auth_db`, `franquicias_db`, `notificaciones_db`), sin
foreign keys cruzadas. Dentro de `franquicias_db` se usa el **modelo A** (tablas
compartidas + `franquicia_id`, filtrado por el JWT).

### 4.1 Tablas de `franquicias_db`

**Estructura**
- `franquicia` — franquicias.
- `sucursal` — sucursales (`franquicia_id`).

**Catálogo global (gestiona el ADMIN)**
- `menu` — menús.
- `franquicia_menu` — qué menús tiene cada franquicia (asignación).
- `item` — producto vendible; `precio` global, `imagen`. Pertenece a un `menu`
  (visible a las franquicias con ese menú) **o** es exclusivo (`franquicia_id`).
- `materia_prima` — insumos con su `unidad` (porción, presa, gramo, ml…).
- `receta` — ficha técnica: cuánta materia prima consume cada item por unidad.

**Por franquicia (scoping por `franquicia_id` del JWT)**
- `inventario` — stock de materia prima de cada franquicia.
- `venta` — ventas; incluye `metodo_pago` (EFECTIVO / TRANSFERENCIA / TARJETA).
- `detalle_venta` — líneas de la venta (item, cantidad, precio).
- `movimiento_inventario` — entradas/salidas/ajustes de stock (base de reportes).
- `solicitud` — petición de la franquicia (nombre, precio, imagen y razón
  **obligatorios**) para que el admin agregue un item.

### 4.2 Reglas del dominio
- **Precio global:** el precio vive en el `item`, igual para todas las franquicias.
- **Descuento de inventario:** al registrar una venta, por cada línea y por cada
  insumo de la receta del item se descuenta del inventario de esa franquicia y se
  registra un `movimiento_inventario` de tipo `SALIDA`.
- **Bloqueo por stock:** un item está **disponible** en una franquicia solo si su
  inventario cubre la receta; si no alcanza, el item se **bloquea** (no se puede
  vender hasta que el admin reponga stock). El inventario nunca queda negativo.
- **Asignación:** menú completo + items exclusivos. Todo lo gestiona el ADMIN; la
  franquicia solo envía solicitudes.

### 4.3 Rendimiento y escalado (sin rehacer la API)
Índices compuestos (p. ej. `ix_venta_franquicia_id_fecha_venta`) → tablas de
reportes pre-agregadas / *materialized views* → partición nativa → réplica de
lectura → (solo si hace falta) aislamiento por schema/base.

La convención completa de nombres y columnas está en
[docs/CONVENCIONES_BD.md](docs/CONVENCIONES_BD.md).

---

## 5. Flujos clave

### 5.1 Login único con redirección por rol
El login único lo sirve la SPA de franquicia (`/login`). Según `role`:
`franquicia` → su panel (`/`); `admin` → se redirige a la SPA admin (`/admin/`),
que valida el token al cargar y rebota a `/login` si no es admin.

### 5.2 El admin crea/asigna
```
Admin crea menús, items (con imagen), materia prima y recetas.
Admin asigna menús a franquicias (franquicia_menu).
Admin carga inventario por franquicia (movimiento ENTRADA).
```

### 5.3 La franquicia vende (con descuento de inventario)
```
Franquicia registra venta (items + cantidades + método de pago)
      │  valida stock por receta (bloquea el item si no alcanza)
      ▼
crea venta + detalle_venta
      ▼
por cada insumo de cada receta → descuenta inventario → movimiento SALIDA
      ▼
reportes: ventas (por método / item / fecha), consumo, stock actual
```

### 5.4 La franquicia pide un item (solicitud)
```
Franquicia crea solicitud (nombre, precio, imagen, razón — obligatorios)
      ▼
Admin la revisa → aprueba (crea el item exclusivo de esa franquicia) o rechaza
```

### 5.5 Reportes por franquicia
Filtrados por el `franquicia_id` del JWT: una franquicia solo ve lo suyo; el
admin ve todas.

---

## 6. Permisos (quién puede qué)

| Acción | ADMIN | FRANQUICIA |
|---|:---:|:---:|
| Menús, items, materia prima, recetas | ✅ | ❌ |
| Asignar menús a franquicias | ✅ | ❌ |
| Cargar/ajustar inventario | ✅ | ❌ |
| Registrar ventas (descuentan stock) | ✅ | ✅ (las suyas) |
| Ver reportes | ✅ (todas) | ✅ (la suya) |
| Crear solicitud de item | ✅ | ✅ |
| Resolver solicitudes | ✅ | ❌ |

---

## 7. Frontends (React + Vite) — dos SPAs

- `frontend/franquicia` (base `/`): login único + panel de franquicia (venta,
  reportes propios, solicitudes, cliente WebSocket).
- `frontend/admin` (base `/admin/`): catálogo, asignación de menús, inventario,
  resolución de solicitudes y reportes globales. Valida rol `admin`.

---

## 8. Estructura del repositorio

```
franquisisas/
├── PLAN.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── docs/
│   └── CONVENCIONES_BD.md
├── nginx/                      # rutea /, /admin/, /api/*, /media/, /ws/
├── postgres/init/              # crea una base por servicio
├── services/
│   ├── auth/                   # identidad + JWT (RS256) + usuarios/roles
│   ├── franquicias/            # catálogo, inventario, ventas, reportes, solicitudes
│   └── notificaciones/         # Channels + Daphne (WebSockets)
├── frontend/
│   ├── admin/                  # SPA administración (base: /admin/)
│   └── franquicia/             # SPA franquicia + login (base: /)
└── shared/jwt_keys/            # claves RS256 (private solo en auth)
```

Volúmenes Docker: `pgdata` (Postgres) y `media` (imágenes).

---

## 9. Servicios en `docker-compose`

`nginx`, `auth`, `franquicias`, `notificaciones`, `frontend-admin`,
`frontend-franquicia`, `postgres`, `redis`.
- `postgres` crea las bases por servicio al iniciar.
- Cada backend arranca con **Daphne** (ASGI).
- Las imágenes viven en el volumen `media` (escribe `franquicias`, sirve `nginx`).
- Redis exige contraseña; su puerto no se expone al host.
- `nginx` es el único puerto expuesto (`8080`), al que apunta NPM en producción.

---

## 10. Alcance de la v1 ("esqueleto que arranca")

`docker-compose up` levanta todo y funciona el **login end-to-end** con
redirección por rol, una llamada de prueba a `franquicias` y una conexión WS.
El catálogo, el inventario, las ventas con descuento, las solicitudes y los
reportes quedan **cableados y con modelos listos**, para iterar encima.

---

## 11. Pasos de implementación

1. **Scaffolding** — estructura, compose, nginx, env, Postgres. ✅
2. **Convenciones + seguridad** — CONVENCIONES_BD.md, contraseña de Redis. ✅
3. **Esqueleto de servicios y SPAs** — proyectos Django + apps + modelos; Vite. ✅
4. **Dominio ampliado** — menú, item, materia prima, receta, asignación,
   inventario, movimientos, solicitud, métodos de pago, media, bloqueo por stock. ✅ *(modelos y docs)*
5. **auth** — claves RS256, endpoints `login/refresh/me` + alta de usuario.
6. **franquicias** — validación JWT, CRUD de catálogo (admin), asignación,
   inventario, ventas con descuento, solicitudes y reportes.
7. **notificaciones** — consumer WS autenticado + avisos.
8. **frontends** — las dos SPAs conectadas end-to-end.

---

## 12. Backlog (después de la v1)
- Reportes pre-agregados / materialized views para consumo y ventas.
- Alertas en tiempo real de stock bajo.
- Precio por franquicia (si se necesita).
- Habilitar/deshabilitar items puntuales por franquicia.
- Migrar imágenes a object storage (MinIO/S3) si crece el volumen.
- Tests por servicio y CI; hardening de producción.
