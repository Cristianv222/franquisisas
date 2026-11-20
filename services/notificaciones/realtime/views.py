"""Endpoint HTTP para emitir una notificación a una franquicia (solo ADMIN)."""
import json

import jwt
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt


def _claims(request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        with open(settings.JWT_PUBLIC_KEY_PATH, "r", encoding="utf-8") as fh:
            clave = fh.read()
        return jwt.decode(auth.split()[1], clave, algorithms=["RS256"])
    except (jwt.PyJWTError, OSError, IndexError):
        return None


@csrf_exempt
def emitir(request):
    if request.method != "POST":
        return JsonResponse({"detail": "Método no permitido."}, status=405)
    claims = _claims(request)
    if not claims or claims.get("role") != "ADMIN":
        return JsonResponse({"detail": "Requiere rol administrador."}, status=403)
    try:
        data = json.loads(request.body or "{}")
    except ValueError:
        return JsonResponse({"detail": "JSON inválido."}, status=400)

    franquicia_id = data.get("franquicia_id")
    if franquicia_id is None:
        return JsonResponse({"detail": "Falta franquicia_id."}, status=400)

    layer = get_channel_layer()
    grupo = f"franquicia_{franquicia_id}"
    async_to_sync(layer.group_send)(
        grupo, {"type": "notificar", "payload": {"mensaje": data.get("mensaje", "")}}
    )
    return JsonResponse({"enviado": True, "grupo": grupo})
