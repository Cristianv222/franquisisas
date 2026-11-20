from django.contrib import admin
from django.http import JsonResponse
from django.urls import path

from realtime.views import emitir


def health(_request):
    return JsonResponse({"service": "notificaciones", "status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("emitir/", emitir),
]
