from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'printer'

router = DefaultRouter()
router.register(r'printers', views.PrinterViewSet, basename='printer')
router.register(r'agent-tokens', views.PrinterAgentTokenViewSet, basename='agenttoken')
router.register(r'jobs', views.PrintJobViewSet, basename='printjob')
router.register(r'cash-events', views.CashDrawerEventViewSet, basename='cashdrawerevent')

urlpatterns = [
    # ── AGENTE DE IMPRESIÓN LOCAL (auth por X-Printer-Token) ────────────
    path('agente/registrar/', views.agente_registrar, name='agente-registrar'),
    path('agente/trabajos/', views.agente_trabajos_pendientes, name='agente-trabajos'),
    path('agente/resultado/', views.agente_reportar_resultado, name='agente-resultado'),
    path('agente/estado/', views.agente_estado, name='agente-estado'),
    path('agente/abrir-caja/', views.agente_abrir_caja, name='agente-abrir-caja'),

    # ── IMPRESIÓN DESDE EL POS (auth por JWT) ──────────────────────────
    # Flujo principal: comanda + ticket juntos en la impresora del local.
    path('print/order/sale/', views.PrintSaleView.as_view(), name='print-order-sale'),
    # Reimpresiones puntuales.
    path('print/order/pos/', views.PrintOrderPOSView.as_view(), name='print-order-pos'),
    path('print/order/kitchen/', views.PrintOrderKitchenView.as_view(), name='print-order-kitchen'),
    # Impresión directa genérica.
    path('print/', views.PrintAPIView.as_view(), name='print'),

    # ── UTILIDAD ───────────────────────────────────────────────────────
    path('status/', views.print_status, name='print-status'),
    path('open-drawer/', views.open_cash_drawer, name='open-cash-drawer'),
    path('settings/', views.PrinterSettingsView.as_view(), name='printer-settings'),

    # ── CRUD (router) ──────────────────────────────────────────────────
    path('', include(router.urls)),
]
