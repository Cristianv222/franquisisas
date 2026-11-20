from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"service": "auth", "status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    # Nota: nginx quita el prefijo /api/auth/, así que aquí las rutas van en raíz.
    path("", include("accounts.urls")),
]
