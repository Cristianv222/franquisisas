from django.db import models

from core.models import ModeloBase
from core.validators import validar_imagen


# ======================================================================
#  Estructura de franquicias
# ======================================================================
class Franquicia(ModeloBase):
    class Estado(models.TextChoices):
        ACTIVA = "ACTIVA", "Activa"
        SUSPENDIDA = "SUSPENDIDA", "Suspendida"

    nombre = models.CharField(max_length=150)
    propietario = models.CharField(max_length=150, blank=True)
    identificacion = models.CharField(max_length=20, blank=True)  # RUC o cédula
    telefono = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    direccion = models.CharField(max_length=255, blank=True)
    ciudad = models.CharField(max_length=120, blank=True)
    logo = models.ImageField(
        upload_to="franquicias/", null=True, blank=True, validators=[validar_imagen]
    )
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ACTIVA
    )
    # Nº de mesas del local (lo configura el propio franquiciado). 0 = sin mesas.
    num_mesas = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "franquicia"


class Sucursal(ModeloBase):
    franquicia = models.ForeignKey(
        Franquicia,
        on_delete=models.PROTECT,
        db_column="franquicia_id",
        related_name="sucursales",
    )
    nombre = models.CharField(max_length=150)
    direccion = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "sucursal"


# ======================================================================
#  Catálogo global — SOLO lo gestiona el ADMIN
# ======================================================================
class Menu(ModeloBase):
    class Estado(models.TextChoices):
        ACTIVO = "ACTIVO", "Activo"
        INACTIVO = "INACTIVO", "Inactivo"

    nombre = models.CharField(max_length=150)
    descripcion = models.CharField(max_length=255, blank=True)
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ACTIVO
    )

    class Meta:
        db_table = "menu"


class FranquiciaMenu(ModeloBase):
    """Asignación de un menú a una franquicia (la hace el admin)."""

    franquicia = models.ForeignKey(
        Franquicia,
        on_delete=models.CASCADE,
        db_column="franquicia_id",
        related_name="menus_asignados",
    )
    menu = models.ForeignKey(
        Menu,
        on_delete=models.CASCADE,
        db_column="menu_id",
        related_name="franquicias_asignadas",
    )

    class Meta:
        db_table = "franquicia_menu"
        constraints = [
            models.UniqueConstraint(
                fields=["franquicia", "menu"],
                name="uq_franquicia_menu_franquicia_id_menu_id",
            ),
        ]


class Item(ModeloBase):
    """Producto vendible. Pertenece a un menú (global) o es exclusivo de una franquicia."""

    class Estado(models.TextChoices):
        ACTIVO = "ACTIVO", "Activo"
        INACTIVO = "INACTIVO", "Inactivo"

    nombre = models.CharField(max_length=150)
    descripcion = models.CharField(max_length=255, blank=True)
    precio = models.DecimalField(max_digits=10, decimal_places=2)  # global
    imagen = models.ImageField(upload_to="items/", validators=[validar_imagen])
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.ACTIVO
    )

    # Un item de menú (menu_id) lo ven las franquicias con ese menú asignado.
    menu = models.ForeignKey(
        Menu,
        on_delete=models.PROTECT,
        db_column="menu_id",
        related_name="items",
        null=True,
        blank=True,
    )
    # Un item exclusivo (franquicia_id) solo aparece en esa franquicia.
    franquicia_id = models.BigIntegerField(null=True, blank=True)

    class Meta:
        db_table = "item"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(precio__gte=0),
                name="ck_item_precio_positivo",
            ),
            # Debe pertenecer a un menú o ser exclusivo de una franquicia.
            models.CheckConstraint(
                condition=models.Q(menu__isnull=False)
                | models.Q(franquicia_id__isnull=False),
                name="ck_item_menu_o_franquicia",
            ),
        ]
        indexes = [
            models.Index(fields=["franquicia_id"], name="ix_item_franquicia_id"),
        ]


class MateriaPrima(ModeloBase):
    class Unidad(models.TextChoices):
        UNIDAD = "UNIDAD", "Unidad"
        PORCION = "PORCION", "Porción"
        PRESA = "PRESA", "Presa"
        GRAMO = "GRAMO", "Gramo"
        KILOGRAMO = "KILOGRAMO", "Kilogramo"
        MILILITRO = "MILILITRO", "Mililitro"
        LITRO = "LITRO", "Litro"

    nombre = models.CharField(max_length=150)
    unidad = models.CharField(max_length=20, choices=Unidad.choices)
    # Costo unitario del insumo (para valorar la bodega general).
    precio = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Stock en la bodega general (almacén central del admin). Se surte con
    # compras y se descuenta al transferir a una franquicia.
    stock_central = models.DecimalField(max_digits=12, decimal_places=3, default=0)

    class Meta:
        db_table = "materia_prima"
        constraints = [
            models.UniqueConstraint(
                fields=["nombre"], name="uq_materia_prima_nombre"
            ),
            models.CheckConstraint(
                condition=models.Q(precio__gte=0),
                name="ck_materia_prima_precio_positivo",
            ),
            models.CheckConstraint(
                condition=models.Q(stock_central__gte=0),
                name="ck_materia_prima_stock_central_no_neg",
            ),
        ]


class Receta(ModeloBase):
    """Ficha técnica: cuánta materia prima consume un item por unidad vendida."""

    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        db_column="item_id",
        related_name="receta",
    )
    materia_prima = models.ForeignKey(
        MateriaPrima,
        on_delete=models.PROTECT,
        db_column="materia_prima_id",
        related_name="recetas",
    )
    cantidad = models.DecimalField(max_digits=10, decimal_places=3)

    class Meta:
        db_table = "receta"
        constraints = [
            models.UniqueConstraint(
                fields=["item", "materia_prima"],
                name="uq_receta_item_id_materia_prima_id",
            ),
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0),
                name="ck_receta_cantidad_positiva",
            ),
        ]


# ======================================================================
#  Por franquicia — scoping por el franquicia_id del JWT
# ======================================================================
class Inventario(ModeloBase):
    """Stock de materia prima de UNA franquicia. El admin lo carga/ajusta."""

    franquicia_id = models.BigIntegerField()
    materia_prima = models.ForeignKey(
        MateriaPrima,
        on_delete=models.PROTECT,
        db_column="materia_prima_id",
        related_name="inventarios",
    )
    cantidad_actual = models.DecimalField(
        max_digits=12, decimal_places=3, default=0
    )
    # Umbral para la semaforización y la alerta de stock bajo.
    umbral_minimo = models.DecimalField(
        max_digits=12, decimal_places=3, default=5
    )

    class Meta:
        db_table = "inventario"
        constraints = [
            models.UniqueConstraint(
                fields=["franquicia_id", "materia_prima"],
                name="uq_inventario_franquicia_id_materia_prima_id",
            ),
            # Nunca negativo: la venta se bloquea si no alcanza (regla de negocio).
            models.CheckConstraint(
                condition=models.Q(cantidad_actual__gte=0),
                name="ck_inventario_cantidad_no_negativa",
            ),
        ]
        indexes = [
            models.Index(
                fields=["franquicia_id"], name="ix_inventario_franquicia_id"
            ),
        ]


class Mesa(ModeloBase):
    """Mesa del croquis de una franquicia (posición en %, forma y capacidad)."""

    class Forma(models.TextChoices):
        CUADRADA = "CUADRADA", "Cuadrada"
        REDONDA = "REDONDA", "Redonda"
        BARRA = "BARRA", "Barra"

    franquicia_id = models.BigIntegerField()
    numero = models.PositiveIntegerField()
    # Posición en el croquis, en porcentaje (0–100) para que sea responsivo.
    pos_x = models.DecimalField(max_digits=5, decimal_places=2, default=50)
    pos_y = models.DecimalField(max_digits=5, decimal_places=2, default=50)
    forma = models.CharField(max_length=10, choices=Forma.choices, default=Forma.CUADRADA)
    capacidad = models.PositiveIntegerField(default=4)

    class Meta:
        db_table = "mesa"
        constraints = [
            models.UniqueConstraint(
                fields=["franquicia_id", "numero"], name="uq_mesa_franq_numero"
            ),
        ]
        indexes = [
            models.Index(fields=["franquicia_id"], name="ix_mesa_franquicia_id"),
        ]


class Cliente(ModeloBase):
    """Cliente de una franquicia (opcional en la venta: si no, Consumidor Final)."""

    franquicia_id = models.BigIntegerField()
    cedula = models.CharField(max_length=20, blank=True)
    nombre = models.CharField(max_length=150)
    telefono = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    class Meta:
        db_table = "cliente"
        constraints = [
            models.UniqueConstraint(
                fields=["franquicia_id", "cedula"],
                condition=~models.Q(cedula=""),
                name="uq_cliente_franq_cedula",
            ),
        ]
        indexes = [
            models.Index(fields=["franquicia_id", "nombre"], name="ix_cliente_franq_nombre"),
        ]


class Venta(ModeloBase):
    class MetodoPago(models.TextChoices):
        EFECTIVO = "EFECTIVO", "Efectivo"
        TRANSFERENCIA = "TRANSFERENCIA", "Transferencia"
        DEUNA = "DEUNA", "De una (QR)"
        TARJETA = "TARJETA", "Tarjeta"

    class TipoEntrega(models.TextChoices):
        MESA = "MESA", "En mesa"
        LLEVAR = "LLEVAR", "Para llevar"

    franquicia_id = models.BigIntegerField()
    numero_orden = models.PositiveIntegerField(null=True, blank=True)  # continuo por franquicia
    sucursal = models.ForeignKey(
        Sucursal,
        on_delete=models.PROTECT,
        db_column="sucursal_id",
        related_name="ventas",
        null=True,
        blank=True,
    )
    cliente = models.ForeignKey(
        Cliente,
        on_delete=models.SET_NULL,
        db_column="cliente_id",
        related_name="ventas",
        null=True,
        blank=True,
    )
    tipo_entrega = models.CharField(
        max_length=10, choices=TipoEntrega.choices, default=TipoEntrega.MESA
    )
    mesa = models.PositiveIntegerField(null=True, blank=True)  # nº de mesa (si aplica)
    fecha_venta = models.DateField()
    metodo_pago = models.CharField(max_length=20, choices=MetodoPago.choices)
    monto_total = models.DecimalField(max_digits=12, decimal_places=2)
    monto_recibido = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )  # efectivo recibido (para el vuelto)

    class Meta:
        db_table = "venta"
        indexes = [
            models.Index(
                fields=["franquicia_id", "fecha_venta"],
                name="ix_venta_franq_fecha",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(monto_total__gte=0),
                name="ck_venta_monto_positivo",
            ),
        ]


class DetalleVenta(ModeloBase):
    venta = models.ForeignKey(
        Venta,
        on_delete=models.CASCADE,
        db_column="venta_id",
        related_name="detalles",
    )
    item = models.ForeignKey(
        Item,
        on_delete=models.PROTECT,
        db_column="item_id",
        related_name="detalles_venta",
    )
    cantidad = models.PositiveIntegerField()
    precio_unitario = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "detalle_venta"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0),
                name="ck_detalle_venta_cantidad_positiva",
            ),
        ]


class MovimientoInventario(ModeloBase):
    """Cada entrada/salida/ajuste de stock. Base de los reportes de consumo."""

    class Tipo(models.TextChoices):
        ENTRADA = "ENTRADA", "Entrada"
        SALIDA = "SALIDA", "Salida"
        AJUSTE = "AJUSTE", "Ajuste"
        COMPRA = "COMPRA", "Compra (bodega general)"
        TRANSFERENCIA = "TRANSFERENCIA", "Transferencia a franquicia"

    # Null = movimiento de la bodega general (sin franquicia).
    franquicia_id = models.BigIntegerField(null=True, blank=True)
    materia_prima = models.ForeignKey(
        MateriaPrima,
        on_delete=models.PROTECT,
        db_column="materia_prima_id",
        related_name="movimientos",
    )
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    cantidad = models.DecimalField(max_digits=12, decimal_places=3)
    # Si el movimiento viene de una venta (SALIDA), se referencia aquí.
    venta = models.ForeignKey(
        Venta,
        on_delete=models.SET_NULL,
        db_column="venta_id",
        related_name="movimientos",
        null=True,
        blank=True,
    )
    motivo = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "movimiento_inventario"
        indexes = [
            models.Index(
                fields=["franquicia_id", "creado_en"],
                name="ix_movinv_franq_creado",
            ),
        ]


class Solicitud(ModeloBase):
    """Único 'escribir' de la franquicia: pedir al admin que agregue un item.

    El admin la revisa y, si aprueba, crea el Item exclusivo de esa franquicia.
    """

    class Estado(models.TextChoices):
        PENDIENTE = "PENDIENTE", "Pendiente"
        APROBADA = "APROBADA", "Aprobada"
        RECHAZADA = "RECHAZADA", "Rechazada"
        ATENDIDA = "ATENDIDA", "Atendida"

    franquicia_id = models.BigIntegerField()
    nombre = models.CharField(max_length=150)          # obligatorio
    precio = models.DecimalField(max_digits=10, decimal_places=2)  # obligatorio
    imagen = models.ImageField(
        upload_to="solicitudes/", validators=[validar_imagen]
    )  # obligatorio
    razon = models.TextField()                          # obligatorio
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.PENDIENTE
    )
    respuesta_admin = models.TextField(blank=True)
    # Item creado al aprobar la solicitud (si aplica).
    item_creado = models.ForeignKey(
        Item,
        on_delete=models.SET_NULL,
        db_column="item_creado_id",
        related_name="solicitudes",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "solicitud"
        indexes = [
            models.Index(
                fields=["franquicia_id", "estado"],
                name="ix_solic_franq_estado",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(precio__gte=0),
                name="ck_solicitud_precio_positivo",
            ),
        ]


class SolicitudInsumo(ModeloBase):
    """La franquicia pide al admin que le aumente el stock de un insumo.

    Al aprobar, el admin transfiere ese insumo desde la bodega general.
    """

    class Estado(models.TextChoices):
        PENDIENTE = "PENDIENTE", "Pendiente"
        APROBADA = "APROBADA", "Aprobada"
        RECHAZADA = "RECHAZADA", "Rechazada"

    franquicia_id = models.BigIntegerField()
    materia_prima = models.ForeignKey(
        MateriaPrima,
        on_delete=models.PROTECT,
        db_column="materia_prima_id",
        related_name="solicitudes_insumo",
    )
    cantidad = models.DecimalField(max_digits=12, decimal_places=3)
    razon = models.TextField(blank=True)
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.PENDIENTE
    )
    respuesta_admin = models.TextField(blank=True)

    class Meta:
        db_table = "solicitud_insumo"
        indexes = [
            models.Index(
                fields=["franquicia_id", "estado"],
                name="ix_solicins_franq_estado",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0),
                name="ck_solic_insumo_cant_pos",
            ),
        ]
