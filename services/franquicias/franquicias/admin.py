from django.contrib import admin

from .models import Franquicia, Sucursal, Venta

admin.site.register(Franquicia)
admin.site.register(Sucursal)
admin.site.register(Venta)
