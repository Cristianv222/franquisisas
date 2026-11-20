"""Validación de JWT con la clave pública (RS256), sin llamar al servicio auth."""
import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

_PUBLIC_KEY = None


def _public_key():
    global _PUBLIC_KEY
    if _PUBLIC_KEY is None:
        try:
            with open(settings.JWT_PUBLIC_KEY_PATH, "r", encoding="utf-8") as fh:
                _PUBLIC_KEY = fh.read()
        except OSError:
            _PUBLIC_KEY = ""
    return _PUBLIC_KEY


class UsuarioJWT:
    """Usuario ligero construido desde los claims del token (no hay tabla de usuarios aquí)."""

    def __init__(self, claims):
        self.id = claims.get("sub")
        self.role = claims.get("role")
        self.sub_rol = claims.get("sub_rol")
        self.franquicia_id = claims.get("franquicia_id")
        self.claims = claims

    @property
    def is_authenticated(self):
        return True

    @property
    def es_admin(self):
        return self.role == "ADMIN"


class JWTPublicKeyAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        header = authentication.get_authorization_header(request).split()
        if not header or header[0].lower() != b"bearer":
            return None
        if len(header) != 2:
            raise exceptions.AuthenticationFailed("Encabezado Authorization inválido.")
        token = header[1].decode()
        try:
            claims = jwt.decode(token, _public_key(), algorithms=["RS256"])
        except jwt.PyJWTError:
            raise exceptions.AuthenticationFailed("Token inválido o expirado.")
        if claims.get("token_type") != "access":
            raise exceptions.AuthenticationFailed("Se requiere un token de acceso.")
        return (UsuarioJWT(claims), token)

    def authenticate_header(self, request):
        # Hace que un token inválido/expirado devuelva 401 (no 403),
        # para que el frontend dispare el refresh del token.
        return "Bearer"
