from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"service": "franquicias", "status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    # nginx quita el prefijo /api/franquicias/, así que las rutas van en raíz.
    path("", include("franquicias.urls")),
]
