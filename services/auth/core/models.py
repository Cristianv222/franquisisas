from django.db import models


class ModeloBase(models.Model):
    """Columnas de auditoría estándar para todas las tablas (ver CONVENCIONES_BD.md)."""

    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
