"""Middleware de Channels: valida el JWT (RS256) de la conexión WebSocket."""
from urllib.parse import parse_qs

import jwt
from channels.middleware import BaseMiddleware
from django.conf import settings

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


class JWTAuthMiddleware(BaseMiddleware):
    """Lee el token de la query string (?token=...) y adjunta los claims al scope."""

    async def __call__(self, scope, receive, send):
        scope["claims"] = None
        qs = parse_qs(scope.get("query_string", b"").decode())
        token = qs.get("token", [None])[0]
        if token:
            try:
                claims = jwt.decode(token, _public_key(), algorithms=["RS256"])
                if claims.get("token_type") == "access":
                    scope["claims"] = claims
            except jwt.PyJWTError:
                scope["claims"] = None
        return await super().__call__(scope, receive, send)
