from django.urls import re_path

from . import consumers

# nginx reenvía /ws/ a este servicio conservando la ruta.
websocket_urlpatterns = [
    re_path(r"^ws/$", consumers.NotificacionesConsumer.as_asgi()),
]
