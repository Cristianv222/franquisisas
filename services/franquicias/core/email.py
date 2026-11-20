"""Correos del servicio franquicias vía Resend. Tolerante a fallos:
sin RESEND_API_KEY no envía y no rompe el flujo (la alerta igual se ve en el panel)."""
import json
import urllib.request

from django.conf import settings


def _enviar(asunto, html, to):
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if not api_key or not to:
        return False
    data = json.dumps(
        {
            "from": getattr(settings, "RESEND_FROM", "onboarding@resend.dev"),
            "to": [to],
            "subject": asunto,
            "html": html,
        }
    ).encode()
    try:
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=data,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception:
        return False


def enviar_alerta_stock(email, franquicia, detalle):
    html = (
        f"<p>Hola {franquicia},</p>"
        f"<p>Los siguientes insumos están por agotarse en tu franquicia:</p>"
        f"<p><b>{detalle}</b></p>"
        f"<p>Repón stock pronto para no interrumpir tus ventas.</p>"
        f"<p>— FRANQOR</p>"
    )
    return _enviar("Alerta de stock bajo — FRANQOR", html, email)
