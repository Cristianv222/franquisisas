from django.conf import settings
from django.core.exceptions import ValidationError


def validar_imagen(archivo):
    """Valida tamaño y formato de una imagen subida (items, solicitudes)."""
    max_mb = getattr(settings, "MAX_IMAGE_SIZE_MB", 2)
    if archivo.size > max_mb * 1024 * 1024:
        raise ValidationError(f"La imagen no debe superar {max_mb} MB.")

    permitidos = getattr(
        settings,
        "IMAGEN_FORMATOS_PERMITIDOS",
        ["image/jpeg", "image/png", "image/webp"],
    )
    tipo = getattr(archivo, "content_type", None)
    if tipo and tipo not in permitidos:
        raise ValidationError("Formato no permitido. Usa JPG, PNG o WebP.")
