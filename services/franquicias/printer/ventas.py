"""
Impresión automática al registrar una venta.

``imprimir_venta`` se llama justo DESPUÉS de guardar la venta y deja en cola, en la
impresora de ESA franquicia, la comanda de cocina y el ticket de venta (con apertura
de caja). El agente del local los recoge y los imprime.

Regla de oro: la impresión NUNCA puede tumbar ni deshacer una venta. Si no hay
impresora o algo falla, la venta queda guardada igual y se devuelve el motivo para
que el POS lo muestre (el cajero puede reimprimir después).
"""
import logging

from django.db import transaction
from django.utils import timezone

from .models import Printer, PrintJob
from .views import (
    _generate_kitchen_ticket,
    _generate_pos_ticket,
    _get_franquicia,
    _json_safe,
)

logger = logging.getLogger(__name__)

ENCOLADA = "encolada"
SIN_IMPRESORA = "sin_impresora"
ERROR = "error"

_ETIQUETA_PAGO = {
    "EFECTIVO": "Efectivo",
    "TRANSFERENCIA": "Transferencia",
    "DEUNA": "De una (QR)",
    "TARJETA": "Tarjeta",
}


def _datos_de_impresion(venta):
    """Arma el mismo formato que usan los endpoints manuales de impresión."""
    detalles = list(venta.detalles.select_related("item").all())
    items = [
        {
            "name": d.item.nombre,
            "quantity": int(d.cantidad),
            "price": float(d.precio_unitario),
            "total": float(d.subtotal),
            "note": "",
            "product_id": str(d.item_id),
        }
        for d in detalles
    ]
    total = float(venta.monto_total)

    if venta.tipo_entrega == "LLEVAR":
        mesa = "PARA LLEVAR"
    else:
        mesa = str(venta.mesa) if venta.mesa else "N/A"

    cliente = venta.cliente.nombre if venta.cliente_id and venta.cliente else "CONSUMIDOR FINAL"

    # Pago: en efectivo se muestra lo recibido y el cambio; en los demás, el total.
    recibido = float(venta.monto_recibido) if venta.monto_recibido is not None else None
    if venta.metodo_pago == "EFECTIVO" and recibido is not None:
        aplicado, cambio = recibido, max(recibido - total, 0.0)
    else:
        aplicado, cambio = total, 0.0

    return {
        "order_number": str(venta.numero_orden or venta.id),
        "customer_name": cliente,
        "table_number": mesa,
        "items": items,
        "subtotal": total,
        "discount": 0,
        "total": total,
        "notes": "",
        "printed_at": timezone.now().isoformat(),
        "payments_list": [{
            "method_name": _ETIQUETA_PAGO.get(venta.metodo_pago, venta.metodo_pago),
            "currency_code": "USD",
            "amount_applied": aplicado,
            "change_amount": cambio,
        }],
    }


def imprimir_venta(venta, con_comanda=True):
    """
    Encola comanda + ticket de la venta. Devuelve un dict para el POS:
    ``{"estado": "encolada" | "sin_impresora" | "error", "detalle": str}``.
    No lanza excepciones.
    """
    try:
        printer = Printer.get_for_franquicia(venta.franquicia_id)
        if not printer:
            logger.info("Venta %s (F%s): sin impresora activa, no se imprime",
                        venta.id, venta.franquicia_id)
            return {"estado": SIN_IMPRESORA,
                    "detalle": "Esta franquicia no tiene una impresora activa configurada."}

        data = _datos_de_impresion(venta)
        franquicia = _get_franquicia(venta.franquicia_id)

        with transaction.atomic():  # comanda y ticket salen juntos o no salen
            if con_comanda:
                PrintJob.objects.create(
                    franquicia_id=venta.franquicia_id, printer=printer,
                    document_type="kitchen_order",
                    content=_generate_kitchen_ticket(printer, data, data["items"]),
                    data=_json_safe(data), open_cash_drawer=False, status="pending")
            PrintJob.objects.create(
                franquicia_id=venta.franquicia_id, printer=printer,
                document_type="receipt",
                content=_generate_pos_ticket(printer, data, franquicia),
                data=_json_safe(data), open_cash_drawer=True, status="pending")

        return {"estado": ENCOLADA, "detalle": f"Enviado a «{printer.name}»."}
    except Exception:  # la venta ya está guardada: jamás propagar
        logger.exception("Venta %s (F%s): falló al encolar la impresión",
                         getattr(venta, "id", "?"), getattr(venta, "franquicia_id", "?"))
        return {"estado": ERROR, "detalle": "No se pudo enviar a imprimir."}
