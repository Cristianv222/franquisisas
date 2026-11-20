from rest_framework import serializers

from .models import (
    Cliente,
    DetalleVenta,
    Franquicia,
    FranquiciaMenu,
    Inventario,
    Item,
    MateriaPrima,
    Menu,
    Mesa,
    Receta,
    Solicitud,
    SolicitudInsumo,
    Sucursal,
    Venta,
)

_AUDIT = ["creado_en", "actualizado_en"]


class RelativeImageField(serializers.ImageField):
    """Devuelve la URL relativa (/media/...) en vez de absoluta, para evitar
    problemas de host/puerto detrás de nginx. El navegador la resuelve contra
    el origen actual (y también funciona en producción tras el proxy)."""

    def to_representation(self, value):
        if not value:
            return None
        try:
            return value.url
        except Exception:
            return None


class FranquiciaSerializer(serializers.ModelSerializer):
    logo = RelativeImageField(required=False, allow_null=True)

    class Meta:
        model = Franquicia
        fields = [
            "id", "nombre", "propietario", "identificacion", "telefono", "email",
            "direccion", "ciudad", "logo", "estado", "num_mesas", *_AUDIT,
        ]
        read_only_fields = _AUDIT


class SucursalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sucursal
        fields = ["id", "franquicia", "nombre", "direccion", *_AUDIT]
        read_only_fields = _AUDIT


class MenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = Menu
        fields = ["id", "nombre", "descripcion", "estado", *_AUDIT]
        read_only_fields = _AUDIT


class FranquiciaMenuSerializer(serializers.ModelSerializer):
    class Meta:
        model = FranquiciaMenu
        fields = ["id", "franquicia", "menu", *_AUDIT]
        read_only_fields = _AUDIT


class ItemSerializer(serializers.ModelSerializer):
    imagen = RelativeImageField()

    class Meta:
        model = Item
        fields = [
            "id", "nombre", "descripcion", "precio", "imagen",
            "estado", "menu", "franquicia_id", *_AUDIT,
        ]
        read_only_fields = _AUDIT


class MateriaPrimaSerializer(serializers.ModelSerializer):
    valor = serializers.SerializerMethodField()

    class Meta:
        model = MateriaPrima
        fields = ["id", "nombre", "unidad", "precio", "stock_central", "valor", *_AUDIT]
        read_only_fields = ["stock_central", *_AUDIT]  # el stock solo cambia por compras

    def get_valor(self, obj):
        return str(obj.precio * obj.stock_central)


class RecetaSerializer(serializers.ModelSerializer):
    materia_prima_nombre = serializers.CharField(source="materia_prima.nombre", read_only=True)
    materia_prima_unidad = serializers.CharField(source="materia_prima.unidad", read_only=True)

    class Meta:
        model = Receta
        fields = [
            "id", "item", "materia_prima", "materia_prima_nombre",
            "materia_prima_unidad", "cantidad", *_AUDIT,
        ]
        read_only_fields = _AUDIT


class InventarioSerializer(serializers.ModelSerializer):
    materia_prima_nombre = serializers.CharField(
        source="materia_prima.nombre", read_only=True
    )
    materia_prima_unidad = serializers.CharField(
        source="materia_prima.unidad", read_only=True
    )

    class Meta:
        model = Inventario
        fields = [
            "id", "franquicia_id", "materia_prima", "materia_prima_nombre",
            "materia_prima_unidad", "cantidad_actual", "umbral_minimo", *_AUDIT,
        ]
        read_only_fields = _AUDIT


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ["id", "franquicia_id", "cedula", "nombre", "telefono", "email", *_AUDIT]
        read_only_fields = ["franquicia_id", *_AUDIT]


class MesaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Mesa
        fields = ["id", "franquicia_id", "numero", "pos_x", "pos_y", "forma", "capacidad"]
        read_only_fields = ["franquicia_id"]


class DetalleVentaSerializer(serializers.ModelSerializer):
    item_nombre = serializers.CharField(source="item.nombre", read_only=True)

    class Meta:
        model = DetalleVenta
        fields = ["id", "item", "item_nombre", "cantidad", "precio_unitario", "subtotal"]


class LineaVentaSerializer(serializers.Serializer):
    item = serializers.IntegerField()
    cantidad = serializers.IntegerField(min_value=1)


class CrearVentaSerializer(serializers.Serializer):
    sucursal = serializers.IntegerField(required=False, allow_null=True)
    fecha_venta = serializers.DateField()
    metodo_pago = serializers.ChoiceField(choices=Venta.MetodoPago.choices)
    franquicia_id = serializers.IntegerField(required=False)  # solo admin
    cliente = serializers.IntegerField(required=False, allow_null=True)
    tipo_entrega = serializers.ChoiceField(
        choices=Venta.TipoEntrega.choices, required=False, default=Venta.TipoEntrega.MESA
    )
    mesa = serializers.IntegerField(required=False, allow_null=True)
    monto_recibido = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    detalles = LineaVentaSerializer(many=True)


class VentaSerializer(serializers.ModelSerializer):
    detalles = DetalleVentaSerializer(many=True, read_only=True)
    cliente_nombre = serializers.SerializerMethodField()
    cliente_cedula = serializers.CharField(source="cliente.cedula", read_only=True, default="")
    vuelto = serializers.SerializerMethodField()

    class Meta:
        model = Venta
        fields = [
            "id", "franquicia_id", "numero_orden", "sucursal", "cliente",
            "cliente_nombre", "cliente_cedula", "tipo_entrega", "mesa",
            "fecha_venta", "metodo_pago", "monto_total", "monto_recibido",
            "vuelto", "detalles", "creado_en",
        ]

    def get_cliente_nombre(self, obj):
        return obj.cliente.nombre if obj.cliente else "Consumidor Final"

    def get_vuelto(self, obj):
        if obj.monto_recibido is not None:
            return str(obj.monto_recibido - obj.monto_total)
        return None


class SolicitudSerializer(serializers.ModelSerializer):
    imagen = RelativeImageField()

    class Meta:
        model = Solicitud
        fields = [
            "id", "franquicia_id", "nombre", "precio", "imagen", "razon",
            "estado", "respuesta_admin", "item_creado", "creado_en",
        ]
        read_only_fields = [
            "franquicia_id", "estado", "respuesta_admin", "item_creado", "creado_en",
        ]


class ResolverSolicitudSerializer(serializers.Serializer):
    aprobar = serializers.BooleanField()
    respuesta_admin = serializers.CharField(required=False, allow_blank=True)


class SolicitudInsumoSerializer(serializers.ModelSerializer):
    materia_prima_nombre = serializers.CharField(
        source="materia_prima.nombre", read_only=True
    )
    materia_prima_unidad = serializers.CharField(
        source="materia_prima.unidad", read_only=True
    )

    class Meta:
        model = SolicitudInsumo
        fields = [
            "id", "franquicia_id", "materia_prima", "materia_prima_nombre",
            "materia_prima_unidad", "cantidad", "razon", "estado",
            "respuesta_admin", "creado_en",
        ]
        read_only_fields = [
            "franquicia_id", "estado", "respuesta_admin", "creado_en",
        ]
