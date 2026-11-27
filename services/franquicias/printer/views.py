"""
Vistas del sistema de impresión — ADAPTADO A MULTI-FRANQUICIA.

Dos mundos, dos autenticaciones:

1. El PANEL POS (frontend) habla por JWT. De cada petición se lee
   ``request.user.franquicia_id`` y se ESTAMPA en el PrintJob. Un local
   nunca puede crear trabajos de otro.

2. El AGENTE DE IMPRESIÓN local habla por un token propio por franquicia
   (cabecera ``X-Printer-Token``). El servidor resuelve la franquicia desde
   el token y el polling devuelve SOLO los trabajos de esa franquicia. Así,
   con N franquicias conectadas, cada agente imprime únicamente lo suyo.

En este proyecto cada local tiene UNA sola impresora: la comanda de cocina
(sin precios) sale junto con el ticket de venta (con precios y apertura de
caja) en la misma impresora.
"""
from django.views.decorators.csrf import csrf_exempt
from rest_framework import viewsets, status, generics, mixins
from rest_framework.decorators import action, api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.utils import timezone
from django.db import transaction
from django.db.models import ProtectedError
from django.conf import settings as dj_settings
from datetime import timedelta
from zoneinfo import ZoneInfo
import logging

from .models import (
    Printer, PrintJob, CashDrawerEvent, PrinterSettings, PrinterAgentToken,
)
from .serializers import (
    PrinterSerializer, PrintJobSerializer,
    CashDrawerEventSerializer, PrinterSettingsSerializer,
    PrintRequestSerializer, TestConnectionSerializer,
    AgenteRegistroSerializer, AgenteResultadoSerializer,
    PrintOrderSerializer, PrinterAgentTokenSerializer,
)
from .print_manager import PrinterManager
from core.permissions import EsAdmin, EsAdminFranquicia

logger = logging.getLogger(__name__)

# Tiempo máximo que un trabajo puede estar 'printing' sin confirmación.
PRINTING_TIMEOUT_S = 120


# ============================================================================
# HELPERS DE AISLAMIENTO
# ============================================================================

def _franquicia_id(request):
    """franquicia_id del JWT del panel POS (None si es admin o no viene)."""
    return getattr(request.user, 'franquicia_id', None)


def _es_admin(request):
    return bool(getattr(request.user, 'es_admin', False))


def _usuario(request):
    """Identificador del creador para auditoría (no hay tabla de usuarios)."""
    uid = getattr(request.user, 'id', None)
    return str(uid) if uid is not None else 'system'


def _agente_desde_token(request):
    """
    Resuelve el agente de impresión a partir de la cabecera X-Printer-Token.
    Devuelve el PrinterAgentToken activo o None.
    """
    # Solo por cabecera: un token en la URL quedaría en logs de nginx/proxies.
    token = request.META.get('HTTP_X_PRINTER_TOKEN', '').strip()
    return PrinterAgentToken.resolver(token)


def _hora_local(dt):
    """
    Hora de pared del local. El servidor corre en UTC pero el ticket debe
    mostrar la hora de Ecuador (configurable con PRINT_TIMEZONE).
    """
    return dt.astimezone(ZoneInfo(dj_settings.PRINT_TIMEZONE))


def _json_safe(data):
    """Copia serializable a JSON (el payload trae UUID/Decimal que el JSONField no acepta)."""
    import json
    return json.loads(json.dumps(data, default=str))


def _get_franquicia(franquicia_id):
    """Trae el registro de Franquicia (para datos de empresa del ticket)."""
    try:
        from franquicias.models import Franquicia
        return Franquicia.objects.filter(id=franquicia_id).first()
    except Exception:
        return None


# ============================================================================
# VIEWSETS CRUD — scoped por franquicia (JWT)
# ============================================================================

class PrinterViewSet(viewsets.ModelViewSet):
    """Gestión de impresoras de la franquicia del usuario."""
    serializer_class = PrinterSerializer

    def get_permissions(self):
        # Cualquiera con sesión puede ver; solo el administrador de la
        # franquicia (no el cajero) crea/edita/prueba impresoras.
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            return [IsAuthenticated()]
        return [(EsAdminFranquicia | EsAdmin)()]

    def get_queryset(self):
        qs = Printer.objects.all()
        if not _es_admin(self.request):
            qs = qs.filter(franquicia_id=_franquicia_id(self.request))
        return qs.order_by('name')

    def perform_create(self, serializer):
        # La impresora SIEMPRE queda ligada a la franquicia del token.
        fid = _franquicia_id(self.request)
        if not fid:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Solo una franquicia puede registrar impresoras.'})
        serializer.save(franquicia_id=fid)

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'No se puede eliminar: ya tiene tickets impresos. Desactívala en su lugar.'},
                status=status.HTTP_409_CONFLICT)

    @action(detail=True, methods=['post'])
    def test_print(self, request, pk=None):
        printer = self.get_object()
        try:
            success, message = PrinterManager.print_test_page(printer, user=_usuario(request))
            if success:
                return Response({'status': 'success', 'message': message})
            return Response({'status': 'error', 'message': message},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Error en prueba de impresión: {e}")
            return Response({'status': 'error', 'message': str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def test_cash_drawer(self, request, pk=None):
        printer = self.get_object()
        try:
            success, message = PrinterManager.open_cash_drawer(printer)
            if success:
                CashDrawerEvent.objects.create(
                    printer=printer, event_type='test', success=True,
                    notes='Prueba manual de caja registradora',
                    triggered_by=_usuario(request),
                )
                return Response({'status': 'success', 'message': message})
            return Response({'status': 'error', 'message': message},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            logger.error(f"Error en prueba de caja: {e}")
            return Response({'status': 'error', 'message': str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def test_connection(self, request):
        serializer = TestConnectionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        try:
            success, message = PrinterManager.test_connection(
                data['connection_type'], data['connection_string'], data.get('port'))
            return Response({'success': success, 'message': message})
        except Exception as e:
            return Response({'success': False, 'message': str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'])
    def default(self, request):
        """Impresora por defecto de la franquicia del usuario."""
        printer = Printer.get_for_franquicia(_franquicia_id(request))
        if printer:
            return Response(self.get_serializer(printer).data)
        return Response({'detail': 'No hay impresora configurada'},
                        status=status.HTTP_404_NOT_FOUND)


class PrinterAgentTokenViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Token del agente de impresión de la franquicia (lo gestiona su administrador).

    El token en claro SOLO se devuelve al crear o rotar; después únicamente se
    ve su sufijo. Se pega en la configuración del agente en el PC del local.
    """
    serializer_class = PrinterAgentTokenSerializer
    permission_classes = [EsAdminFranquicia]

    def get_queryset(self):
        return PrinterAgentToken.objects.filter(
            franquicia_id=_franquicia_id(self.request)).order_by('created_at')

    def create(self, request):
        fid = _franquicia_id(request)
        nombre = (request.data.get('nombre') or '').strip() or 'Agente de impresión'
        agente, token = PrinterAgentToken.crear(fid, nombre[:100])
        data = PrinterAgentTokenSerializer(agente).data
        data['token'] = token
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def rotar(self, request, pk=None):
        """Genera un token nuevo; el anterior deja de funcionar."""
        agente = self.get_object()
        token = agente.rotar()
        data = PrinterAgentTokenSerializer(agente).data
        data['token'] = token
        return Response(data)

    @action(detail=True, methods=['post'])
    def revocar(self, request, pk=None):
        agente = self.get_object()
        agente.is_active = False
        agente.save(update_fields=['is_active', 'updated_at'])
        return Response(PrinterAgentTokenSerializer(agente).data)


class PrintJobViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                      mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Historial de trabajos de impresión de la franquicia."""
    serializer_class = PrintJobSerializer

    def get_permissions(self):
        # Borrar historial y reencolar: solo el administrador de la franquicia.
        if self.action in ('destroy', 'retry'):
            return [(EsAdminFranquicia | EsAdmin)()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = PrintJob.objects.all().order_by('-created_at')
        if not _es_admin(self.request):
            qs = qs.filter(franquicia_id=_franquicia_id(self.request))

        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        printer_id = self.request.query_params.get('printer_id')
        if printer_id:
            qs = qs.filter(printer_id=printer_id)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        return qs

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        print_job = self.get_object()
        if print_job.status != 'failed':
            return Response({'error': 'Solo se pueden reintentar trabajos fallidos'},
                            status=status.HTTP_400_BAD_REQUEST)
        print_job.status = 'pending'
        print_job.error_message = ''
        print_job.save(update_fields=['status', 'error_message'])
        return Response({'status': 'success', 'message': 'Trabajo reencolado',
                         'job_id': str(print_job.id)})

    @action(detail=False, methods=['get'])
    def estadisticas(self, request):
        from datetime import timedelta
        from django.db.models import Count

        qs = PrintJob.objects.all()
        if not _es_admin(request):
            qs = qs.filter(franquicia_id=_franquicia_id(request))

        hace_24h = timezone.now() - timedelta(hours=24)
        stats = {
            'total': qs.count(),
            'pendientes': qs.filter(status='pending').count(),
            'completados': qs.filter(status='completed').count(),
            'fallidos': qs.filter(status='failed').count(),
            'ultimas_24h': qs.filter(created_at__gte=hace_24h).count(),
            'por_impresora': list(
                qs.values('printer__name').annotate(total=Count('id')).order_by('-total')
            ),
        }
        return Response(stats)


class CashDrawerEventViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                             viewsets.GenericViewSet):
    """Historial de aperturas de caja de la franquicia."""
    serializer_class = CashDrawerEventSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = CashDrawerEvent.objects.all().order_by('-created_at')
        if not _es_admin(self.request):
            qs = qs.filter(printer__franquicia_id=_franquicia_id(self.request))

        printer_id = self.request.query_params.get('printer_id')
        if printer_id:
            qs = qs.filter(printer_id=printer_id)
        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(created_at__date=date)
        success = self.request.query_params.get('success')
        if success is not None:
            qs = qs.filter(success=success.lower() == 'true')
        return qs


class PrinterSettingsView(generics.RetrieveUpdateAPIView):
    """Configuración global de impresión (encabezados/pies por defecto)."""
    serializer_class = PrinterSettingsSerializer
    # Es configuración GLOBAL de toda la plataforma: una franquicia no la toca.
    permission_classes = [EsAdmin]

    def get_object(self):
        return PrinterSettings.get_settings()


# ============================================================================
# ENDPOINTS DEL AGENTE DE IMPRESIÓN — autenticados por X-Printer-Token
# ============================================================================

@api_view(['POST'])
@authentication_classes([])          # el agente NO usa JWT
@permission_classes([AllowAny])
@csrf_exempt
def agente_registrar(request):
    """Registro / handshake del agente. Identifica la franquicia por su token."""
    agente = _agente_desde_token(request)
    if not agente:
        return Response({'error': 'Token de agente inválido o revocado'},
                        status=status.HTTP_401_UNAUTHORIZED)

    serializer = AgenteRegistroSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'error': 'Datos inválidos', 'detalles': serializer.errors},
                        status=status.HTTP_400_BAD_REQUEST)
    data = serializer.validated_data

    agente.computadora = data['computadora']
    agente.version_agente = data['version_agente']
    agente.ultima_conexion = timezone.now()
    agente.save(update_fields=['computadora', 'version_agente', 'ultima_conexion', 'updated_at'])

    logger.info(
        f"✅ Agente F{agente.franquicia_id} '{agente.nombre}' registrado "
        f"({data['computadora']}, v{data['version_agente']}, "
        f"{len(data['impresoras'])} impresoras)"
    )
    return Response({
        'message': 'Agente registrado exitosamente',
        'franquicia_id': agente.franquicia_id,
        'agente': agente.nombre,
        'impresoras_detectadas': len(data['impresoras']),
        'servidor_time': timezone.now().isoformat(),
    })


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def agente_trabajos_pendientes(request):
    """
    Polling del agente. Devuelve SOLO los trabajos pendientes de la franquicia
    dueña del token. Cada trabajo incluye la impresora destino.
    """
    agente = _agente_desde_token(request)
    if not agente:
        return Response({'error': 'Token de agente inválido o revocado'},
                        status=status.HTTP_401_UNAUTHORIZED)

    ahora = timezone.now()
    # Telemetría: no escribir en cada poll (cada 1-3 s), basta cada 30 s.
    if not agente.ultima_conexion or ahora - agente.ultima_conexion > timedelta(seconds=30):
        agente.ultima_conexion = ahora
        agente.save(update_fields=['ultima_conexion', 'updated_at'])

    # Trabajos entregados que el agente nunca confirmó (PC apagado, corte de
    # luz, crash) vuelven a la cola: si no, el ticket se perdería para siempre.
    PrintJob.objects.filter(
        franquicia_id=agente.franquicia_id, status='printing',
        started_at__lt=ahora - timedelta(seconds=PRINTING_TIMEOUT_S),
    ).update(status='pending')

    trabajos_qs = PrintJob.objects.filter(
        franquicia_id=agente.franquicia_id,      # ← AISLAMIENTO
        status='pending',
    ).select_related('printer').order_by('created_at', 'id')[:10]

    trabajos_data = []
    for trabajo in trabajos_qs:
        try:
            # Reclamo ATÓMICO: si dos polls llegan a la vez, solo uno lo gana
            # (evita imprimir el mismo ticket dos veces).
            reclamado = PrintJob.objects.filter(
                pk=trabajo.pk, status='pending'
            ).update(status='printing', started_at=ahora)
            if not reclamado:
                continue
            trabajos_data.append({
                'id': str(trabajo.id),
                'impresora': trabajo.printer.name,
                'impresora_id': str(trabajo.printer.id),
                # Cómo llegar a la impresora (el agente decide: red directa o cola del sistema).
                'conexion': {
                    'tipo': trabajo.printer.connection_type,
                    'host': trabajo.printer.connection_string
                    if trabajo.printer.connection_type == 'network' else '',
                    'puerto': trabajo.printer.port or 9100,
                },
                'comandos': generar_comandos_escpos(trabajo),
                'tipo': trabajo.document_type,
                'copias': trabajo.copies,
                'abrir_caja': trabajo.open_cash_drawer,
            })
        except Exception as e:
            logger.error(f"❌ Error procesando trabajo {trabajo.id}: {e}")
            trabajo.mark_as_failed(f"Error al preparar impresión: {e}")
            continue

    if trabajos_data:
        logger.info(f"📥 Agente F{agente.franquicia_id}: {len(trabajos_data)} trabajos entregados")
    return Response({'franquicia_id': agente.franquicia_id, 'trabajos': trabajos_data})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@csrf_exempt
def agente_reportar_resultado(request):
    """El agente reporta el resultado. Solo puede tocar trabajos de SU franquicia."""
    agente = _agente_desde_token(request)
    if not agente:
        return Response({'error': 'Token de agente inválido o revocado'},
                        status=status.HTTP_401_UNAUTHORIZED)

    serializer = AgenteResultadoSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'error': 'Datos inválidos', 'detalles': serializer.errors},
                        status=status.HTTP_400_BAD_REQUEST)
    data = serializer.validated_data

    try:
        trabajo = PrintJob.objects.get(
            id=data['trabajo_id'], franquicia_id=agente.franquicia_id)
    except PrintJob.DoesNotExist:
        return Response({'error': 'Trabajo no encontrado para esta franquicia'},
                        status=status.HTTP_404_NOT_FOUND)

    # Idempotente: un reporte repetido (reintento de red del agente) no debe
    # duplicar eventos de caja ni pisar un trabajo que ya quedó cerrado.
    ya_cerrado = trabajo.status in ('completed', 'cancelled')
    if not ya_cerrado:
        if data['success']:
            trabajo.status = 'completed'
            trabajo.completed_at = timezone.now()
            trabajo.error_message = ''
            trabajo.save(update_fields=['status', 'completed_at', 'error_message'])
            if trabajo.open_cash_drawer and trabajo.printer:
                trabajo.cash_drawer_opened = True
                trabajo.save(update_fields=['cash_drawer_opened'])
                CashDrawerEvent.objects.create(
                    printer=trabajo.printer, print_job=trabajo, event_type='print',
                    success=True, triggered_by=agente.nombre,
                    notes=f"Apertura automática - Trabajo #{trabajo.job_number}")
            logger.info(f"✅ Trabajo {trabajo.job_number} completado")
        else:
            trabajo.mark_as_failed(data.get('mensaje', 'Error desconocido'))
            logger.error(f"❌ Trabajo {trabajo.job_number} falló: {data.get('mensaje')}")

    return Response({'message': 'Resultado registrado', 'trabajo_id': str(trabajo.id),
                     'job_number': trabajo.job_number, 'status': trabajo.status})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def agente_estado(request):
    """Estado del sistema de impresión de la franquicia del agente."""
    agente = _agente_desde_token(request)
    if not agente:
        return Response({'error': 'Token de agente inválido o revocado'},
                        status=status.HTTP_401_UNAUTHORIZED)

    fid = agente.franquicia_id
    return Response({
        'agente_conectado': True,
        'franquicia_id': fid,
        'agente': agente.nombre,
        'ultima_conexion': agente.ultima_conexion.isoformat() if agente.ultima_conexion else None,
        'version_agente': agente.version_agente or 'N/A',
        'computadora': agente.computadora or 'N/A',
        'trabajos_pendientes': PrintJob.objects.filter(franquicia_id=fid, status='pending').count(),
        'trabajos_completados_hoy': PrintJob.objects.filter(
            franquicia_id=fid, status='completed',
            completed_at__date=timezone.now().date()).count(),
        'impresoras_activas': Printer.objects.filter(franquicia_id=fid, is_active=True).count(),
        'servidor_time': timezone.now().isoformat(),
    })


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@csrf_exempt
def agente_abrir_caja(request):
    """Apertura de caja solicitada por el agente (impresora de su franquicia)."""
    agente = _agente_desde_token(request)
    if not agente:
        return Response({'error': 'Token de agente inválido o revocado'},
                        status=status.HTTP_401_UNAUTHORIZED)

    printer_id = request.data.get('printer_id')
    notas = request.data.get('notas', '')
    if printer_id:
        printer = Printer.objects.filter(
            id=printer_id, franquicia_id=agente.franquicia_id, is_active=True).first()
    else:
        printer = Printer.get_for_franquicia(agente.franquicia_id)

    if not printer:
        return Response({'error': 'Impresora no encontrada para esta franquicia'},
                        status=status.HTTP_404_NOT_FOUND)
    if not printer.has_cash_drawer:
        return Response({'error': 'Esta impresora no tiene caja registradora'},
                        status=status.HTTP_400_BAD_REQUEST)

    job = PrintJob.objects.create(
        franquicia_id=agente.franquicia_id, printer=printer, document_type='other',
        content='Apertura manual de caja', data={'accion': 'abrir_caja', 'notas': notas},
        open_cash_drawer=True, status='pending', created_by=agente.nombre)
    CashDrawerEvent.objects.create(
        printer=printer, print_job=job, event_type='manual', success=True,
        notes=notas, triggered_by=agente.nombre)

    return Response({'message': 'Solicitud de apertura enviada',
                     'job_id': str(job.id), 'job_number': job.job_number})


# ============================================================================
# COMANDOS ESC/POS (sin cambios de lógica)
# ============================================================================

def generar_comandos_escpos(trabajo):
    """Genera comandos ESC/POS en hex para el trabajo."""
    try:
        ESC = b'\x1b'
        GS = b'\x1d'
        comandos = bytearray()
        comandos.extend(ESC + b'@')
        comandos.extend(ESC + b'a' + b'\x01')
        comandos.extend(ESC + b'E' + b'\x01')
        try:
            contenido = trabajo.content.encode('utf-8', errors='ignore')
        except Exception:
            contenido = b'Error en contenido\n'
        comandos.extend(contenido)
        comandos.extend(ESC + b'E' + b'\x00')
        comandos.extend(b'\n\n\n')
        comandos.extend(GS + b'V' + b'\x41' + b'\x00')

        if trabajo.open_cash_drawer and trabajo.printer and trabajo.printer.has_cash_drawer:
            try:
                pin = max(0, min(255, trabajo.printer.cash_drawer_pin or 0))
                on_time = max(0, min(255, trabajo.printer.cash_drawer_on_time or 50))
                off_time = max(0, min(255, trabajo.printer.cash_drawer_off_time or 50))
                comandos.extend(ESC + b'p' + bytes([pin, on_time, off_time]))
            except Exception as e:
                logger.warning(f"No se pudo agregar comando de caja: {e}")
        return comandos.hex()
    except Exception as e:
        logger.error(f"Error generando comandos ESC/POS: {e}")
        return (b'\x1b@' + b'Error generando ticket\n\n\n').hex()


# ============================================================================
# IMPRESIÓN DIRECTA (genérica) — scoped por franquicia
# ============================================================================

class PrintAPIView(APIView):
    permission_classes = [IsAuthenticated]

    @csrf_exempt
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    @transaction.atomic
    def post(self, request):
        serializer = PrintRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        printer = data['printer']

        fid = _franquicia_id(request)
        if not _es_admin(request) and printer.franquicia_id != fid:
            return Response({'error': 'La impresora no pertenece a su franquicia'},
                            status=status.HTTP_403_FORBIDDEN)
        try:
            print_job = PrintJob.objects.create(
                franquicia_id=printer.franquicia_id, printer=printer,
                document_type=data['document_type'], content=data['content'],
                data={'request_data': request.data}, open_cash_drawer=data['open_cash_drawer'],
                copies=data['copies'], created_by=_usuario(request), status='pending')
            return Response({'status': 'success', 'message': 'Trabajo de impresión creado',
                             'job_id': str(print_job.id), 'job_number': print_job.job_number})
        except Exception as e:
            logger.error(f"Error en impresión: {e}")
            return Response({'status': 'error', 'message': str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================================================
# IMPRESIÓN DE VENTA — comanda + ticket juntos en LA impresora del local
# ============================================================================

class PrintSaleView(APIView):
    """
    POST /print/order/sale/
    Flujo principal: al cobrar, salen JUNTOS en la única impresora del local:
      1) la COMANDA de cocina (sin precios)
      2) el TICKET de venta (con precios) + apertura de caja

    Si el local prefiere no imprimir comanda, enviar ``con_comanda=false``.
    """
    permission_classes = [IsAuthenticated]

    @csrf_exempt
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    @transaction.atomic
    def post(self, request):
        fid = _franquicia_id(request)
        if not fid:
            return Response({'error': 'El token no trae franquicia_id'},
                            status=status.HTTP_400_BAD_REQUEST)

        serializer = PrintOrderSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        data = _recalcular_totales(data)

        printer = _resolve_printer(fid, data.get('printer_id'))
        if not printer:
            return Response(
                {'error': 'No hay impresora activa configurada para esta franquicia.'},
                status=status.HTTP_400_BAD_REQUEST)

        franquicia = _get_franquicia(fid)
        usuario = _usuario(request)
        con_comanda = request.data.get('con_comanda', True)
        jobs = []

        # 1) COMANDA de cocina (primero, para que cocina la vea arriba)
        if con_comanda in (True, 'true', 'True', 1, '1'):
            comanda = _generate_kitchen_ticket(printer, data, data.get('items', []))
            jk = PrintJob.objects.create(
                franquicia_id=fid, printer=printer, document_type='kitchen_order',
                content=comanda, data=_json_safe(data), open_cash_drawer=False,
                created_by=usuario, status='pending')
            jobs.append({'destino': 'comanda', 'job_id': str(jk.id), 'job_number': jk.job_number})

        # 2) TICKET de venta + abrir caja
        ticket = _generate_pos_ticket(printer, data, franquicia)
        jt = PrintJob.objects.create(
            franquicia_id=fid, printer=printer, document_type='receipt',
            content=ticket, data=_json_safe(data), open_cash_drawer=True,
            created_by=usuario, status='pending')
        jobs.append({'destino': 'ticket', 'job_id': str(jt.id), 'job_number': jt.job_number})

        logger.info(f"🧾 Venta F{fid}: {len(jobs)} trabajos en '{printer.name}'")
        return Response({'status': 'success', 'message': 'Impresión de venta encolada',
                         'printer': printer.name, 'jobs': jobs})


class PrintOrderPOSView(APIView):
    """POST /print/order/pos/ — solo el ticket de venta (reimpresión)."""
    permission_classes = [IsAuthenticated]

    @csrf_exempt
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        fid = _franquicia_id(request)
        if not fid:
            return Response({'error': 'El token no trae franquicia_id'},
                            status=status.HTTP_400_BAD_REQUEST)
        serializer = PrintOrderSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = _recalcular_totales(serializer.validated_data)

        printer = _resolve_printer(fid, data.get('printer_id'), role='pos')
        if not printer:
            return Response({'error': 'No hay impresora POS activa para esta franquicia.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            content = _generate_pos_ticket(printer, data, _get_franquicia(fid))
            job = PrintJob.objects.create(
                franquicia_id=fid, printer=printer, document_type='receipt',
                content=content, data=_json_safe(data), open_cash_drawer=True,
                created_by=_usuario(request), status='pending')
            return Response({'status': 'success', 'message': 'Ticket POS enviado',
                             'job_id': str(job.id), 'job_number': job.job_number,
                             'printer': printer.name})
        except Exception as e:
            logger.error(f"Error creando POS job: {e}")
            return Response({'status': 'error', 'message': str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PrintOrderKitchenView(APIView):
    """POST /print/order/kitchen/ — solo la comanda de cocina (reimpresión)."""
    permission_classes = [IsAuthenticated]

    @csrf_exempt
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        fid = _franquicia_id(request)
        if not fid:
            return Response({'error': 'El token no trae franquicia_id'},
                            status=status.HTTP_400_BAD_REQUEST)
        serializer = PrintOrderSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data

        printer = _resolve_printer(fid, data.get('printer_id'), role='kitchen')
        if not printer:
            return Response({'error': 'No hay impresora de cocina activa para esta franquicia.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            content = _generate_kitchen_ticket(printer, data, data.get('items', []))
            job = PrintJob.objects.create(
                franquicia_id=fid, printer=printer, document_type='kitchen_order',
                content=content, data=_json_safe(data), open_cash_drawer=False,
                created_by=_usuario(request), status='pending')
            return Response({'status': 'success', 'message': 'Comanda enviada a cocina',
                             'job_id': str(job.id), 'job_number': job.job_number,
                             'printer': printer.name})
        except Exception as e:
            logger.error(f"Error creando Kitchen job: {e}")
            return Response({'status': 'error', 'message': str(e)},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ============================================================================
# HELPERS DE IMPRESIÓN
# ============================================================================

def _recalcular_totales(data):
    """Recalcula subtotal/total desde los items si vienen en 0."""
    items = data.get('items', [])
    calculated_subtotal = sum(i.get('quantity', 1) * i.get('price', 0) for i in items)
    discount = data.get('discount', 0)
    if not data.get('subtotal'):
        data['subtotal'] = calculated_subtotal
    if not data.get('total'):
        data['total'] = calculated_subtotal - discount
    return data


def _resolve_printer(franquicia_id, printer_id=None, role=None):
    """
    Resuelve la impresora DENTRO de la franquicia. Si viene printer_id se usa
    esa (validando que sea del local); si no, la impresora del local por rol.
    """
    if printer_id:
        p = Printer.objects.filter(
            id=printer_id, franquicia_id=franquicia_id, is_active=True).first()
        if p:
            return p
        logger.warning(f"printer_id {printer_id} no es de F{franquicia_id}, uso la del local")
    if role == 'kitchen':
        return Printer.get_kitchen_printer(franquicia_id)
    if role == 'pos':
        return Printer.get_pos_printer(franquicia_id)
    return Printer.get_for_franquicia(franquicia_id)


def _generate_pos_ticket(printer, order_data, franquicia=None):
    """Ticket de venta (con precios y totales). Datos de empresa desde Franquicia."""
    chars = printer.characters_per_line or 42
    lines = []

    nombre = (franquicia.nombre if franquicia else 'Mi Negocio')
    direccion = (franquicia.direccion if franquicia and franquicia.direccion else '')
    ruc = (franquicia.identificacion if franquicia and franquicia.identificacion else '')

    lines.append(nombre.center(chars))
    if direccion:
        lines.append(direccion.center(chars))
    if ruc:
        lines.append(f"RUC: {ruc}".center(chars))
    lines.append("=" * chars)
    lines.append("TICKET DE VENTA".center(chars))

    printed_at_str = order_data.get('printed_at', '')
    current_time = None
    if printed_at_str:
        from django.utils.dateparse import parse_datetime
        dt = parse_datetime(printed_at_str)
        if dt:
            current_time = _hora_local(dt)
    if not current_time:
        current_time = _hora_local(timezone.now())

    lines.append(f"Fecha: {current_time.strftime('%d/%m/%Y')}  Hora: {current_time.strftime('%H:%M')}")
    lines.append(f"Ticket #: {(order_data.get('order_number') or 'N/A')}")
    lines.append(f"Cliente: {(order_data.get('customer_name') or 'CONSUMIDOR FINAL')}")
    lines.append(f"Mesa: {(order_data.get('table_number') or 'PARA LLEVAR')}")
    lines.append("-" * chars)
    lines.append(f"{'PRODUCTO':<20}{'CANT':>4}{'PRECIO':>8}{'TOTAL':>10}")
    lines.append("-" * chars)

    for item in order_data.get('items', []):
        name = str(item.get('name', 'Sin nombre')).strip()
        note = item.get('note', '').strip()
        qty = item.get('quantity', 0)
        price = item.get('price', 0)
        total = item.get('total', 0) or (qty * price)
        full_text = f"{name} ({note})" if note else name
        if len(full_text) <= 20:
            lines.append(f"{full_text:<20}{qty:>4}{price:>8.2f}{total:>10.2f}")
        else:
            lines.append(f"{full_text[:20]:<20}{qty:>4}{price:>8.2f}{total:>10.2f}")
            remaining = full_text[20:].strip()
            while remaining:
                lines.append(f"{remaining[:20]:<20}")
                remaining = remaining[20:].strip()

    lines.append("-" * chars)
    subtotal = order_data.get('subtotal', 0)
    discount = order_data.get('discount', 0)
    total = order_data.get('total', 0)
    lines.append(f"{'Subtotal:':<30} ${subtotal:>10.2f}")
    if discount > 0:
        lines.append(f"{'Descuento:':<30} -${discount:>9.2f}")
    lines.append("=" * chars)
    lines.append(f"{'TOTAL:':<30} ${total:>10.2f}")
    lines.append("=" * chars)

    for pago in order_data.get('payments_list', []) or []:
        method = pago.get('method_name', 'Pago')
        currency = pago.get('currency_code', 'USD')
        applied = float(pago.get('amount_applied', 0))
        change = float(pago.get('change_amount', 0))
        lines.append(f"  {method} ({currency}): ${applied:>10.2f}")
        if change >= 0.01:
            lines.append(f"  {'Cambio:':<20} ${change:>10.2f}")

    notes = order_data.get('notes', '').strip()
    if notes:
        lines.append(notes.center(chars))
    lines.append("¡GRACIAS POR SU COMPRA!".center(chars))
    lines.append("\n" * 3)
    return "\n".join(lines)


def _generate_kitchen_ticket(printer, order_data, items):
    """Comanda de cocina (sin precios): cantidad, nombre y notas."""
    chars = printer.characters_per_line or 42
    lines = []
    lines.append("=" * chars)
    lines.append("*** COMANDA DE COCINA ***".center(chars))
    lines.append("=" * chars)
    current_time = _hora_local(timezone.now())
    lines.append(f"Hora: {current_time.strftime('%H:%M:%S')}")
    lines.append(f"Orden #: {(order_data.get('order_number') or 'N/A')}")
    lines.append(f"Mesa:    {(order_data.get('table_number') or 'PARA LLEVAR')}")
    lines.append("-" * chars)
    for item in items:
        name = str(item.get('name', 'Sin nombre')).strip()
        qty = item.get('quantity', 0)
        note = item.get('note', '').strip()
        lines.append(f"  {qty}x  {name}")
        if note:
            lines.append(f"       >> {note}")
    lines.append("=" * chars)
    notes = order_data.get('notes', '').strip()
    if notes:
        lines.append(f"NOTA: {notes}")
        lines.append("-" * chars)
    lines.append("\n" * 3)
    return "\n".join(lines)


# ============================================================================
# UTILIDAD
# ============================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def print_status(request):
    """Estado del sistema de impresión de la franquicia."""
    try:
        fid = _franquicia_id(request)
        qs = PrintJob.objects.all()
        printers = Printer.objects.all()
        if not _es_admin(request):
            qs = qs.filter(franquicia_id=fid)
            printers = printers.filter(franquicia_id=fid)
        default_printer = Printer.get_for_franquicia(fid) if fid else None
        return Response({
            'system': 'online',
            'printers_active': printers.filter(is_active=True).count(),
            'jobs_total': qs.count(),
            'jobs_pending': qs.filter(status='pending').count(),
            'jobs_today': qs.filter(created_at__date=timezone.now().date()).count(),
            'default_printer': default_printer.name if default_printer else None,
        })
    except Exception as e:
        return Response({'system': 'error', 'error': str(e)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def open_cash_drawer(request):
    """Apertura manual de caja desde el POS (impresora de la franquicia)."""
    fid = _franquicia_id(request)
    printer_id = request.data.get('printer_id')
    if printer_id:
        printer = Printer.objects.filter(
            id=printer_id, franquicia_id=fid, is_active=True).first()
    else:
        printer = Printer.get_for_franquicia(fid)

    if not printer:
        return Response({'error': 'No hay impresora configurada para esta franquicia'},
                        status=status.HTTP_400_BAD_REQUEST)
    if not printer.has_cash_drawer:
        return Response({'error': 'Esta impresora no tiene caja registradora'},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        job = PrintJob.objects.create(
            franquicia_id=fid, printer=printer, document_type='other',
            content='Apertura manual de caja', open_cash_drawer=True,
            status='pending', created_by=_usuario(request))
        return Response({'status': 'success', 'message': 'Solicitud de apertura enviada',
                         'job_id': str(job.id)})
    except Exception as e:
        logger.error(f"Error al abrir caja: {e}")
        return Response({'status': 'error', 'message': str(e)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)
