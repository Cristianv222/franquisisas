from rest_framework.permissions import SAFE_METHODS, BasePermission


def _rol(request):
    u = request.user
    return getattr(u, "role", None) if (u and u.is_authenticated) else None


class EsAdmin(BasePermission):
    message = "Requiere rol de administrador."

    def has_permission(self, request, view):
        return _rol(request) == "ADMIN"


class EsFranquicia(BasePermission):
    message = "Requiere rol de franquicia."

    def has_permission(self, request, view):
        return _rol(request) == "FRANQUICIA"


class EsAdminFranquicia(BasePermission):
    message = "Requiere ser administrador de la franquicia."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and getattr(u, "role", None) == "FRANQUICIA"):
            return False
        # Si falta el claim (tokens viejos), se trata como admin de franquicia.
        return getattr(u, "sub_rol", None) != "CAJERO"


class AdminEscrituraFranquiciaLectura(BasePermission):
    """Admin: lectura y escritura. Franquicia: solo lectura."""

    def has_permission(self, request, view):
        rol = _rol(request)
        if rol == "ADMIN":
            return True
        if rol == "FRANQUICIA":
            return request.method in SAFE_METHODS
        return False
