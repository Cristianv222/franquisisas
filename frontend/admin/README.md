# SPA `admin`

Panel de administración (React + Vite). Servido bajo **`/admin/`**.

**Se construye en el paso 5.** Detalles:
- `vite.config.js` con `base: '/admin/'` y dev server en el puerto **5173**.
- Valida el token al cargar; si falta o el rol no es `admin`, redirige a `/login`.
- Gestión y alta de franquicias, reportes globales.
- Consume `auth` (`/api/auth/*`) y `franquicias` (`/api/franquicias/*`).
