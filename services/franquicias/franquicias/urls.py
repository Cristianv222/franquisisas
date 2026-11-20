from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

# nginx ya quitó el prefijo /api/franquicias/.
router = DefaultRouter()
router.register("franquicias", views.FranquiciaViewSet, basename="franquicia")
router.register("sucursales", views.SucursalViewSet, basename="sucursal")
router.register("menus", views.MenuViewSet, basename="menu")
router.register("asignaciones", views.FranquiciaMenuViewSet, basename="asignacion")
router.register("items", views.ItemViewSet, basename="item")
router.register("materias-primas", views.MateriaPrimaViewSet, basename="materiaprima")
router.register("recetas", views.RecetaViewSet, basename="receta")
router.register("inventario", views.InventarioViewSet, basename="inventario")
router.register("clientes", views.ClienteViewSet, basename="cliente")
router.register("mesas", views.MesaViewSet, basename="mesa")
router.register("ventas", views.VentaViewSet, basename="venta")
router.register("solicitudes", views.SolicitudViewSet, basename="solicitud")
router.register(
    "solicitudes-insumo", views.SolicitudInsumoViewSet, basename="solicitud-insumo"
)

urlpatterns = [
    path("", include(router.urls)),
    path("reportes/ventas/", views.ReporteVentasView.as_view()),
    path("reportes/consumo/", views.ReporteConsumoView.as_view()),
    path("reportes/stock/", views.ReporteStockView.as_view()),
    path("reportes/por-franquicia/", views.ReportePorFranquiciaView.as_view()),
    path("reportes/stock-bajo/", views.ReporteStockBajoView.as_view()),
]
