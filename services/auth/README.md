# Servicio `auth`

Identidad y autenticación. Dueño de los usuarios, roles (`admin` / `franquicia`)
y de la emisión/refresco de JWT con **RS256**.

**Se construye en el paso 2.** Contendrá:
- Proyecto Django 6.1.2 + ASGI (`config/`), corriendo bajo Daphne.
- App `accounts/`: modelo de usuario custom, roles, serializers y vistas.
- `djangorestframework-simplejwt` con RS256 (firma con la clave privada de `/keys`).
- Endpoints: `register`, `login`, `refresh`, `logout`, `me` y un endpoint interno
  para crear el usuario de una franquicia.
- Generación de las claves JWT en `shared/jwt_keys/`.
