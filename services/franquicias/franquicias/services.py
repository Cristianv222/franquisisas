"""Lógica de negocio: venta con descuento de inventario (y bloqueo por stock)."""
from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from rest_framework.exceptions import ValidationError

from core.email import enviar_alerta_stock

from .models import (
    Cliente,
    DetalleVenta,
    Franquicia,
    FranquiciaMenu,
    Inventario,
    Item,
    MateriaPrima,
    MovimientoInventario,
    Sucursal,
    Venta,
)


def menus_asignados(franquicia_id):
    return set(
        FranquiciaMenu.objects.filter(franquicia_id=franquicia_id).values_list(
            "menu_id", flat=True
        )
    )


def item_visible(item, franquicia_id, menus=None):
    """Un item es visible si es exclusivo de la franquicia o pertenece a un menú asignado."""
    if item.franquicia_id == franquicia_id:
        return True
    if menus is None:
        menus = menus_asignados(franquicia_id)
    return item.menu_id in menus


@transaction.atomic
def registrar_compra(*, materia_prima_id, cantidad, precio=None, motivo="Compra a bodega general"):
    """Entrada de stock a la BODEGA GENERAL (compra a proveedor). Opcionalmente
    actualiza el costo unitario del insumo."""
    cantidad = Decimal(str(cantidad))
    if cantidad <= 0:
        raise ValidationError({"cantidad": "La cantidad debe ser mayor a cero."})
    mp = MateriaPrima.objects.select_for_update().get(pk=materia_prima_id)
    mp.stock_central = mp.stock_central + cantidad
    campos = ["stock_central", "actualizado_en"]
    if precio not in (None, ""):
        mp.precio = Decimal(str(precio))
        campos.append("precio")
    mp.save(update_fields=campos)
    MovimientoInventario.objects.create(
        franquicia_id=None,
        materia_prima_id=materia_prima_id,
        tipo=MovimientoInventario.Tipo.COMPRA,
        cantidad=cantidad,
        motivo=motivo,
    )
    return mp


@transaction.atomic
def transferir_a_franquicia(*, franquicia_id, materia_prima_id, cantidad, umbral=None,
                            motivo="Transferencia desde bodega general"):
    """Mueve stock de la BODEGA GENERAL a UNA franquicia. Descuenta del general
    y se BLOQUEA si el general no alcanza."""
    cantidad = Decimal(str(cantidad))
    if cantidad <= 0:
        raise ValidationError({"cantidad": "La cantidad debe ser mayor a cero."})

    mp = MateriaPrima.objects.select_for_update().get(pk=materia_prima_id)
    if mp.stock_central < cantidad:
        raise ValidationError(
            {
                "detail": (
                    f"La bodega general no tiene stock suficiente de {mp.nombre}. "
                    f"Disponible: {mp.stock_central} {mp.unidad.lower()}."
                ),
                "disponible": str(mp.stock_central),
            }
        )

    # Descuenta del general.
    mp.stock_central = mp.stock_central - cantidad
    mp.save(update_fields=["stock_central", "actualizado_en"])

    # Suma al inventario de la franquicia.
    inv, _ = Inventario.objects.select_for_update().get_or_create(
        franquicia_id=franquicia_id,
        materia_prima_id=materia_prima_id,
        defaults={"cantidad_actual": 0},
    )
    inv.cantidad_actual = inv.cantidad_actual + cantidad
    campos = ["cantidad_actual", "actualizado_en"]
    if umbral not in (None, ""):
        inv.umbral_minimo = Decimal(str(umbral))
        campos.append("umbral_minimo")
    inv.save(update_fields=campos)

    MovimientoInventario.objects.create(
        franquicia_id=franquicia_id,
        materia_prima_id=materia_prima_id,
        tipo=MovimientoInventario.Tipo.TRANSFERENCIA,
        cantidad=cantidad,
        motivo=motivo,
    )
    return inv


@transaction.atomic
def registrar_venta(*, franquicia_id, sucursal_id, fecha_venta, metodo_pago, lineas,
                    cliente_id=None, mesa=None, tipo_entrega=Venta.TipoEntrega.MESA,
                    monto_recibido=None):
    if not lineas:
        raise ValidationError({"detalles": "Debe incluir al menos una línea."})

    if sucursal_id and not Sucursal.objects.filter(
        id=sucursal_id, franquicia_id=franquicia_id
    ).exists():
        raise ValidationError({"sucursal": "La sucursal no pertenece a esta franquicia."})

    if cliente_id and not Cliente.objects.filter(
        id=cliente_id, franquicia_id=franquicia_id
    ).exists():
        raise ValidationError({"cliente": "El cliente no pertenece a esta franquicia."})

    menus = menus_asignados(franquicia_id)
    total = Decimal("0")
    detalles = []
    consumo = {}  # materia_prima_id -> cantidad requerida total

    for linea in lineas:
        try:
            item = Item.objects.prefetch_related("receta").get(pk=linea["item"])
        except Item.DoesNotExist:
            raise ValidationError({"detalles": f"El item {linea['item']} no existe."})
        if item.estado != Item.Estado.ACTIVO or not item_visible(item, franquicia_id, menus):
            raise ValidationError(
                {"detalles": f"El item {item.id} no está disponible para esta franquicia."}
            )
        cantidad = linea["cantidad"]
        subtotal = item.precio * cantidad
        total += subtotal
        detalles.append((item, cantidad, subtotal))
        for receta in item.receta.all():
            consumo[receta.materia_prima_id] = consumo.get(
                receta.materia_prima_id, Decimal("0")
            ) + receta.cantidad * cantidad

    # Bloqueo por stock: se valida contra el inventario (con lock de filas).
    inventarios = {
        inv.materia_prima_id: inv
        for inv in Inventario.objects.select_for_update().filter(
            franquicia_id=franquicia_id, materia_prima_id__in=list(consumo.keys())
        )
    }
    faltantes = [
        mp_id
        for mp_id, requerido in consumo.items()
        if (inventarios.get(mp_id) is None or inventarios[mp_id].cantidad_actual < requerido)
    ]
    if faltantes:
        raise ValidationError(
            {
                "detail": "Stock insuficiente de materia prima; el item queda bloqueado hasta reponer.",
                "materia_prima_ids": faltantes,
            }
        )

    # Nº de orden continuo por franquicia.
    ultimo = (
        Venta.objects.filter(franquicia_id=franquicia_id).aggregate(
            m=Max("numero_orden")
        )["m"]
        or 0
    )

    # El vuelto solo aplica a efectivo; validamos que alcance.
    recibido = None
    if monto_recibido not in (None, ""):
        recibido = Decimal(str(monto_recibido))
        if metodo_pago == Venta.MetodoPago.EFECTIVO and recibido < total:
            raise ValidationError(
                {"monto_recibido": "El monto recibido no cubre el total de la venta."}
            )

    venta = Venta.objects.create(
        franquicia_id=franquicia_id,
        numero_orden=ultimo + 1,
        sucursal_id=sucursal_id,
        cliente_id=cliente_id,
        tipo_entrega=tipo_entrega or Venta.TipoEntrega.MESA,
        mesa=mesa if tipo_entrega != Venta.TipoEntrega.LLEVAR else None,
        fecha_venta=fecha_venta,
        metodo_pago=metodo_pago,
        monto_total=total,
        monto_recibido=recibido,
    )
    DetalleVenta.objects.bulk_create(
        [
            DetalleVenta(
                venta=venta,
                item=item,
                cantidad=cantidad,
                precio_unitario=item.precio,
                subtotal=subtotal,
            )
            for item, cantidad, subtotal in detalles
        ]
    )
    bajos = []
    for mp_id, requerido in consumo.items():
        inv = inventarios[mp_id]
        antes = inv.cantidad_actual
        inv.cantidad_actual = antes - requerido
        inv.save(update_fields=["cantidad_actual", "actualizado_en"])
        MovimientoInventario.objects.create(
            franquicia_id=franquicia_id,
            materia_prima_id=mp_id,
            tipo=MovimientoInventario.Tipo.SALIDA,
            cantidad=requerido,
            venta=venta,
            motivo="Venta",
        )
        if antes > inv.umbral_minimo and inv.cantidad_actual <= inv.umbral_minimo:
            bajos.append(inv)

    if bajos:
        _alertar_stock_bajo(franquicia_id, bajos)
    return venta


def _alertar_stock_bajo(franquicia_id, inventarios_bajos):
    fr = Franquicia.objects.filter(pk=franquicia_id).first()
    if not fr:
        return
    detalle = "; ".join(
        f"{i.materia_prima.nombre}: {i.cantidad_actual} {i.materia_prima.unidad.lower()}"
        for i in inventarios_bajos
    )
    enviar_alerta_stock(fr.email, fr.nombre, detalle)
