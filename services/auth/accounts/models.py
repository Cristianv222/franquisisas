from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models


class UsuarioManager(UserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("rol", "ADMIN")
        return super().create_superuser(username, email, password, **extra_fields)


class Usuario(AbstractUser):
    """Usuario del sistema. Dueño de la identidad y el rol (admin o franquicia)."""

    class Rol(models.TextChoices):
        ADMIN = "ADMIN", "Administrador"
        FRANQUICIA = "FRANQUICIA", "Franquicia"

    class SubRol(models.TextChoices):
        ADMIN_FRAN = "ADMIN_FRAN", "Administrador de franquicia"
        CAJERO = "CAJERO", "Cajero"

    rol = models.CharField(max_length=20, choices=Rol.choices, default=Rol.FRANQUICIA)
    # Subrol dentro de una franquicia: admin de la franquicia (gestiona usuarios)
    # o cajero (solo ventas + reportes). Vacío para usuarios ADMIN del sistema.
    sub_rol = models.CharField(
        max_length=20, choices=SubRol.choices, blank=True, default=""
    )
    # Enlace lógico a la franquicia (sin FK cruzada entre bases). Null para admin.
    franquicia_id = models.BigIntegerField(null=True, blank=True)
    # Obliga a cambiar la contraseña en el primer ingreso (franquicias nuevas).
    debe_cambiar_password = models.BooleanField(default=False)

    objects = UsuarioManager()

    class Meta:
        db_table = "usuario"
