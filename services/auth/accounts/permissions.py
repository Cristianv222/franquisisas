from rest_framework.permissions import BasePermission

from .models import Usuario


class EsAdmin(BasePermission):
    message = "Requiere rol de administrador."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "rol", None) == Usuario.Rol.ADMIN
        )


class EsAdminFranquicia(BasePermission):
    message = "Requiere ser administrador de la franquicia."

    def has_permission(self, request, view):
        u = request.user
        return bool(
            u
            and u.is_authenticated
            and getattr(u, "rol", None) == Usuario.Rol.FRANQUICIA
            and getattr(u, "sub_rol", None) == Usuario.SubRol.ADMIN_FRAN
        )
