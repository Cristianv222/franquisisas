# Servicio `notificaciones`

Tiempo real vía WebSockets.

**Se construye en el paso 4.** Contendrá:
- Proyecto Django 6.1.2 + **Channels** sobre Daphne (ASGI).
- **Redis** como channel layer (`REDIS_URL`).
- App `realtime/` con un consumer WS autenticado por JWT (el token viaja en la
  conexión y se valida con la clave pública).
- Base para avisos y dashboards en vivo (nueva venta, estado de franquicia, …).
