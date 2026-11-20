"""Envío de credenciales por correo vía Resend. Tolerante a fallos:
si no hay RESEND_API_KEY (dev), simplemente no envía y no rompe el flujo."""
import json
import urllib.request

from django.conf import settings


def enviar_credenciales(email, usuario, password):
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key or not email:
        return False  # dev sin key: la contraseña se muestra en el panel

    cuerpo = (
        f"<p>Hola,</p>"
        f"<p>Tu cuenta de franquicia en <b>franquisisas</b> está lista.</p>"
        f"<ul>"
        f"<li>Usuario: <b>{usuario}</b></li>"
        f"<li>Contraseña temporal: <b>{password}</b></li>"
        f"</ul>"
        f"<p>Al ingresar por primera vez deberás cambiar la contraseña.</p>"
    )
    data = json.dumps(
        {
            "from": getattr(settings, "RESEND_FROM", "onboarding@resend.dev"),
            "to": [email],
            "subject": "Tus credenciales de acceso — franquisisas",
            "html": cuerpo,
        }
    ).encode()
    try:
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception:
        return False
