# SPA `franquicia`

Panel de franquicia + **login único** (React + Vite). Servido en la **raíz `/`**.

**Se construye en el paso 5.** Detalles:
- `vite.config.js` con `base: '/'` y dev server en el puerto **5174**.
- Sirve el `/login` único: tras autenticar, si el rol es `admin` redirige a
  `/admin/`; si es `franquicia`, se queda en su panel.
- Muestra los datos y reportes de **su** franquicia (scoping por `franquicia_id`).
- Cliente WebSocket contra `/ws/` autenticado con el JWT.
- Consume `auth` (`/api/auth/*`) y `franquicias` (`/api/franquicias/*`).
