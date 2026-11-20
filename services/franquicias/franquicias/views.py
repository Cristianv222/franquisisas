from django.db import transaction
from django.db.models import Count, F, Q, Sum
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import (
    AdminEscrituraFranquiciaLectura,
    EsAdmin,
    EsAdminFranquicia,
    EsFranquicia,
)

from . import services
from .models import (
    Cliente,
    Franquicia,
    FranquiciaMenu,
    Inventario,
    Item,
    MateriaPrima,
    Menu,
    Mesa,
    MovimientoInventario,
    Receta,
    Solicitud,
    SolicitudInsumo,
    Sucursal,
    Venta,
)
from .serializers import (
    ClienteSerializer,
    CrearVentaSerializer,
    FranquiciaMenuSerializer,
    FranquiciaSerializer,
    InventarioSerializer,
    ItemSerializer,
    MateriaPrimaSerializer,
    MenuSerializer,
    MesaSerializer,
    RecetaSerializer,
    ResolverSolicitudSerializer,
    SolicitudInsumoSerializer,
    SolicitudSerializer,
    SucursalSerializer,
    VentaSerializer,
)


# ---------------- Catálogo: solo ADMIN ----------------
class FranquiciaViewSet(viewsets.ModelViewSet):
    queryset = Franquicia.objects.all().order_by("nombre")
    serializer_class = FranquiciaSerializer
    permission_classes = [EsAdmin]

    @action(detail=False, methods=["get"], permission_classes=[EsFranquicia])
    def mia(self, request):
        """La franquicia consulta su propia ficha (nombre, logo, nº de mesas)."""
        f = Franquicia.objects.filter(id=request.user.franquicia_id).first()
        if not f:
            return Response(
                {"detail": "Franquicia no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(FranquiciaSerializer(f).data)

    @action(detail=False, methods=["patch"], permission_classes=[EsAdminFranquicia])
    def configurar(self, request):
        """El admin de la franquicia ajusta su configuración (nº de mesas)."""
        f = Franquicia.objects.filter(id=request.user.franquicia_id).first()
        if not f:
            return Response(
                {"detail": "Franquicia no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )
        num = request.data.get("num_mesas")
        if num is not None:
            try:
                f.num_mesas = max(0, int(num))
            except (ValueError, TypeError):
                return Response(
                    {"detail": "num_mesas inválido."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            f.save(update_fields=["num_mesas", "actualizado_en"])
        return Response(FranquiciaSerializer(f).data)


class SucursalViewSet(viewsets.ModelViewSet):
    serializer_class = SucursalSerializer
    permission_classes = [AdminEscrituraFranquiciaLectura]

    def get_queryset(self):
        u = self.request.user
        qs = Sucursal.objects.all().order_by("nombre")
        if getattr(u, "role", None) == "FRANQUICIA":
            qs = qs.filter(franquicia_id=u.franquicia_id)
        return qs


class MenuViewSet(viewsets.ModelViewSet):
    queryset = Menu.objects.all().order_by("nombre")
    serializer_class = MenuSerializer
    permission_classes = [EsAdmin]


class FranquiciaMenuViewSet(viewsets.ModelViewSet):
    queryset = FranquiciaMenu.objects.all()
    serializer_class = FranquiciaMenuSerializer
    permission_classes = [EsAdmin]


class MateriaPrimaViewSet(viewsets.ModelViewSet):
    queryset = MateriaPrima.objects.all().order_by("nombre")
    serializer_class = MateriaPrimaSerializer
    permission_classes = [EsAdmin]

    @action(detail=True, methods=["post"])
    def compra(self, request, pk=None):
        """Entrada de stock a la bodega general (compra). Body: cantidad, precio?."""
        try:
            cantidad = request.data["cantidad"]
        except KeyError:
            return Response(
                {"detail": "Requiere cantidad."}, status=status.HTTP_400_BAD_REQUEST
            )
        mp = services.registrar_compra(
            materia_prima_id=int(pk),
            cantidad=cantidad,
            precio=request.data.get("precio"),
        )
        return Response(MateriaPrimaSerializer(mp).data)


class RecetaViewSet(viewsets.ModelViewSet):
    queryset = Receta.objects.all()
    serializer_class = RecetaSerializer
    permission_classes = [EsAdmin]


# ---------------- Items: admin escribe, franquicia lee lo suyo ----------------
class ItemViewSet(viewsets.ModelViewSet):
    serializer_class = ItemSerializer
    permission_classes = [AdminEscrituraFranquiciaLectura]

    def get_queryset(self):
        u = self.request.user
        qs = Item.objects.all().order_by("nombre")
        if getattr(u, "role", None) == "FRANQUICIA":
            menus = services.menus_asignados(u.franquicia_id)
            qs = qs.filter(Q(franquicia_id=u.franquicia_id) | Q(menu_id__in=menus))
        return qs

    @action(detail=False, methods=["get"])
    def disponibles(self, request):
        """Items vendibles por la franquicia, con flag de disponibilidad según stock."""
        u = request.user
        if getattr(u, "role", None) == "FRANQUICIA":
            franquicia_id = u.franquicia_id
        else:
            franquicia_id = request.query_params.get("franquicia_id")
            if not franquicia_id:
                return Response(
                    {"detail": "Indica franquicia_id."}, status=status.HTTP_400_BAD_REQUEST
                )
            franquicia_id = int(franquicia_id)

        menus = services.menus_asignados(franquicia_id)
        items = (
            Item.objects.filter(
                Q(franquicia_id=franquicia_id) | Q(menu_id__in=menus),
                estado=Item.Estado.ACTIVO,
            )
            .prefetch_related("receta__materia_prima")
            .order_by("nombre")
        )
        stock = {
            inv.materia_prima_id: inv.cantidad_actual
            for inv in Inventario.objects.filter(franquicia_id=franquicia_id)
        }
        data = []
        for item in items:
            faltantes = [
                r.materia_prima.nombre
                for r in item.receta.all()
                if stock.get(r.materia_prima_id, 0) < r.cantidad
            ]
            sin_receta = not item.receta.all()
            data.append(
                {
                    "id": item.id,
                    "nombre": item.nombre,
                    "precio": str(item.precio),
                    "imagen": item.imagen.url if item.imagen else None,
                    "disponible": len(faltantes) == 0,
                    "faltantes": faltantes,
                    "sin_receta": sin_receta,
                }
            )
        return Response(data)


# ---------------- Inventario: franquicia lee lo suyo, admin carga stock ----------------
class InventarioViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = InventarioSerializer
    permission_classes = [AdminEscrituraFranquiciaLectura]

    def get_queryset(self):
        u = self.request.user
        qs = Inventario.objects.select_related("materia_prima").all()
        if getattr(u, "role", None) == "FRANQUICIA":
            qs = qs.filter(franquicia_id=u.franquicia_id)
        return qs

    @action(detail=False, methods=["post"], permission_classes=[EsAdmin])
    def transferir(self, request):
        """Transfiere stock de la bodega general a una franquicia (descuenta del
        general; se bloquea si no alcanza)."""
        try:
            franquicia_id = int(request.data["franquicia_id"])
            materia_prima_id = int(request.data["materia_prima_id"])
            cantidad = request.data["cantidad"]
        except (KeyError, ValueError, TypeError):
            return Response(
                {"detail": "Requiere franquicia_id, materia_prima_id y cantidad."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        inv = services.transferir_a_franquicia(
            franquicia_id=franquicia_id,
            materia_prima_id=materia_prima_id,
            cantidad=cantidad,
            umbral=request.data.get("umbral"),
        )
        return Response(InventarioSerializer(inv).data, status=status.HTTP_201_CREATED)


# ---------------- Clientes: de cada franquicia (buscar por cédula o nombre) ----------------
class ClienteViewSet(viewsets.ModelViewSet):
    serializer_class = ClienteSerializer
    permission_classes = [EsFranquicia]

    def get_queryset(self):
        u = self.request.user
        qs = Cliente.objects.filter(franquicia_id=u.franquicia_id).order_by("nombre")
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(nombre__icontains=q) | Q(cedula__icontains=q))
        return qs

    def perform_create(self, serializer):
        serializer.save(franquicia_id=self.request.user.franquicia_id)


# ---------------- Mesas (croquis): lectura para el POS, edición para el admin ----------------
class MesaViewSet(viewsets.ModelViewSet):
    serializer_class = MesaSerializer

    def get_permissions(self):
        # Cualquier usuario de la franquicia puede VER el croquis (para el POS);
        # solo el admin de la franquicia lo edita.
        if self.action in ("list", "retrieve"):
            return [EsFranquicia()]
        return [EsAdminFranquicia()]

    def get_queryset(self):
        return Mesa.objects.filter(
            franquicia_id=self.request.user.franquicia_id
        ).order_by("numero")

    def perform_create(self, serializer):
        serializer.save(franquicia_id=self.request.user.franquicia_id)

    @action(detail=False, methods=["post"])
    def guardar(self, request):
        """Reemplaza el croquis completo de la franquicia con la lista recibida."""
        fid = request.user.franquicia_id
        mesas = request.data.get("mesas", [])
        numeros = [m.get("numero") for m in mesas]
        if len(numeros) != len(set(numeros)):
            return Response(
                {"detail": "Hay números de mesa repetidos."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            objs = [
                Mesa(
                    franquicia_id=fid,
                    numero=int(m["numero"]),
                    pos_x=m.get("pos_x", 50),
                    pos_y=m.get("pos_y", 50),
                    forma=m.get("forma", Mesa.Forma.CUADRADA),
                    capacidad=int(m.get("capacidad", 4)),
                )
                for m in mesas
            ]
        except (KeyError, ValueError, TypeError):
            return Response(
                {"detail": "Datos de mesa inválidos."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            Mesa.objects.filter(franquicia_id=fid).delete()
            Mesa.objects.bulk_create(objs)
            Franquicia.objects.filter(id=fid).update(num_mesas=len(objs))
        return Response(
            MesaSerializer(
                Mesa.objects.filter(franquicia_id=fid).order_by("numero"), many=True
            ).data
        )


# ---------------- Ventas: franquicia registra las suyas ----------------
class VentaViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = VentaSerializer

    def get_queryset(self):
        u = self.request.user
        qs = Venta.objects.prefetch_related("detalles").all().order_by("-creado_en")
        if getattr(u, "role", None) == "FRANQUICIA":
            qs = qs.filter(franquicia_id=u.franquicia_id)
        return qs

    def create(self, request, *args, **kwargs):
        entrada = CrearVentaSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data

        u = request.user
        if getattr(u, "role", None) == "FRANQUICIA":
            franquicia_id = u.franquicia_id
        else:  # admin debe indicar la franquicia
            franquicia_id = datos.get("franquicia_id")
            if not franquicia_id:
                return Response(
                    {"detail": "El admin debe indicar franquicia_id."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        venta = services.registrar_venta(
            franquicia_id=franquicia_id,
            sucursal_id=datos.get("sucursal"),
            fecha_venta=datos["fecha_venta"],
            metodo_pago=datos["metodo_pago"],
            lineas=datos["detalles"],
            cliente_id=datos.get("cliente"),
            mesa=datos.get("mesa"),
            tipo_entrega=datos.get("tipo_entrega", Venta.TipoEntrega.MESA),
            monto_recibido=datos.get("monto_recibido"),
        )
        return Response(VentaSerializer(venta).data, status=status.HTTP_201_CREATED)


# ---------------- Solicitudes: la franquicia pide, el admin resuelve ----------------
class SolicitudViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SolicitudSerializer

    def get_queryset(self):
        u = self.request.user
        qs = Solicitud.objects.all().order_by("-creado_en")
        if getattr(u, "role", None) == "FRANQUICIA":
            qs = qs.filter(franquicia_id=u.franquicia_id)
        return qs

    def perform_create(self, serializer):
        u = self.request.user
        if getattr(u, "role", None) != "FRANQUICIA":
            raise PermissionDenied("Solo una franquicia puede crear solicitudes.")
        serializer.save(franquicia_id=u.franquicia_id)

    @action(detail=True, methods=["post"], permission_classes=[EsAdmin])
    def resolver(self, request, pk=None):
        solicitud = self.get_object()
        datos = ResolverSolicitudSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        solicitud.respuesta_admin = datos.validated_data.get("respuesta_admin", "")

        if datos.validated_data["aprobar"]:
            item = Item.objects.create(
                nombre=solicitud.nombre,
                precio=solicitud.precio,
                imagen=solicitud.imagen,
                franquicia_id=solicitud.franquicia_id,  # item exclusivo de esa franquicia
                estado=Item.Estado.ACTIVO,
            )
            solicitud.item_creado = item
            solicitud.estado = Solicitud.Estado.ATENDIDA
        else:
            solicitud.estado = Solicitud.Estado.RECHAZADA
        solicitud.save()
        return Response(SolicitudSerializer(solicitud).data)


# ---------------- Solicitudes de insumo: la franquicia pide aumento de stock ----------------
class SolicitudInsumoViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SolicitudInsumoSerializer

    def get_queryset(self):
        u = self.request.user
        qs = (
            SolicitudInsumo.objects.select_related("materia_prima")
            .all()
            .order_by("-creado_en")
        )
        if getattr(u, "role", None) == "FRANQUICIA":
            qs = qs.filter(franquicia_id=u.franquicia_id)
        return qs

    def perform_create(self, serializer):
        u = self.request.user
        if getattr(u, "role", None) != "FRANQUICIA":
            raise PermissionDenied("Solo una franquicia puede solicitar insumos.")
        serializer.save(franquicia_id=u.franquicia_id)

    @action(detail=True, methods=["post"], permission_classes=[EsAdmin])
    def resolver(self, request, pk=None):
        solicitud = self.get_object()
        datos = ResolverSolicitudSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        solicitud.respuesta_admin = datos.validated_data.get("respuesta_admin", "")

        if datos.validated_data["aprobar"]:
            # Transfiere desde la bodega general (se bloquea si no alcanza:
            # entonces la solicitud queda PENDIENTE y el admin debe comprar antes).
            services.transferir_a_franquicia(
                franquicia_id=solicitud.franquicia_id,
                materia_prima_id=solicitud.materia_prima_id,
                cantidad=solicitud.cantidad,
                motivo=f"Solicitud de insumo #{solicitud.id}",
            )
            solicitud.estado = SolicitudInsumo.Estado.APROBADA
        else:
            solicitud.estado = SolicitudInsumo.Estado.RECHAZADA
        solicitud.save()
        return Response(SolicitudInsumoSerializer(solicitud).data)


# ---------------- Reportes (scoping por franquicia_id del token) ----------------
class _BaseReporteView(APIView):
    def _franquicia_id(self, request):
        u = request.user
        if getattr(u, "role", None) == "FRANQUICIA":
            return u.franquicia_id
        return request.query_params.get("franquicia_id")  # admin: opcional


class ReporteVentasView(_BaseReporteView):
    def get(self, request):
        qs = Venta.objects.all()
        fid = self._franquicia_id(request)
        if fid:
            qs = qs.filter(franquicia_id=fid)
        return Response(
            {
                "total": qs.aggregate(cantidad=Count("id"), monto=Sum("monto_total")),
                "por_metodo_pago": list(
                    qs.values("metodo_pago").annotate(
                        cantidad=Count("id"), monto=Sum("monto_total")
                    )
                ),
            }
        )


class ReporteConsumoView(_BaseReporteView):
    def get(self, request):
        qs = MovimientoInventario.objects.filter(
            tipo=MovimientoInventario.Tipo.SALIDA
        )
        fid = self._franquicia_id(request)
        if fid:
            qs = qs.filter(franquicia_id=fid)
        return Response(
            list(
                qs.values(
                    "materia_prima_id", "materia_prima__nombre", "materia_prima__unidad"
                ).annotate(consumo_total=Sum("cantidad"))
            )
        )


class ReportePorFranquiciaView(APIView):
    """Rendimiento (ventas y monto) por franquicia — para el dashboard del admin."""

    permission_classes = [EsAdmin]

    def get(self, request):
        agg = {
            d["franquicia_id"]: d
            for d in Venta.objects.values("franquicia_id").annotate(
                cantidad=Count("id"), monto=Sum("monto_total")
            )
        }
        data = []
        for f in Franquicia.objects.all().order_by("nombre"):
            d = agg.get(f.id)
            data.append(
                {
                    "franquicia_id": f.id,
                    "nombre": f.nombre,
                    "cantidad": d["cantidad"] if d else 0,
                    "monto": float(d["monto"]) if d and d["monto"] else 0,
                }
            )
        return Response(data)


class ReporteStockBajoView(_BaseReporteView):
    """Insumos en o por debajo del umbral mínimo (alertas / semáforo)."""

    def get(self, request):
        qs = Inventario.objects.select_related("materia_prima").filter(
            cantidad_actual__lte=F("umbral_minimo")
        )
        fid = self._franquicia_id(request)
        if fid:
            qs = qs.filter(franquicia_id=fid)
        nombres = {f.id: f.nombre for f in Franquicia.objects.all()}
        return Response(
            [
                {
                    "franquicia_id": inv.franquicia_id,
                    "franquicia": nombres.get(inv.franquicia_id, f"#{inv.franquicia_id}"),
                    "materia_prima": inv.materia_prima.nombre,
                    "unidad": inv.materia_prima.unidad,
                    "cantidad_actual": str(inv.cantidad_actual),
                    "umbral": str(inv.umbral_minimo),
                }
                for inv in qs
            ]
        )


class ReporteStockView(_BaseReporteView):
    def get(self, request):
        qs = Inventario.objects.select_related("materia_prima").all()
        fid = self._franquicia_id(request)
        if fid:
            qs = qs.filter(franquicia_id=fid)
        return Response(
            [
                {
                    "franquicia_id": inv.franquicia_id,
                    "materia_prima": inv.materia_prima.nombre,
                    "unidad": inv.materia_prima.unidad,
                    "cantidad_actual": str(inv.cantidad_actual),
                }
                for inv in qs
            ]
        )
