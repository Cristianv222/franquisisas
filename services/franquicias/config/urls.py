from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"service": "franquicias", "status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    # Impresión (POS por JWT + agente local por X-Printer-Token).
    # Queda en /api/franquicias/printer/... tras el proxy de nginx.
    path("printer/", include("printer.urls")),
    # nginx quita el prefijo /api/franquicias/, así que las rutas van en raíz.
    path("", include("franquicias.urls")),
]
