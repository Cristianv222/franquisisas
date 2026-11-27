"""Tests del CRUD de menús/productos (admin) y de los borrados protegidos."""
from rest_framework.test import APIClient, APITestCase

from core.authentication import UsuarioJWT

from .models import DetalleVenta, Item, Menu, Venta


def _cli(role="ADMIN", franquicia_id=None):
    c = APIClient()
    c.force_authenticate(user=UsuarioJWT({"sub": "1", "role": role, "franquicia_id": franquicia_id}))
    return c


class MenuItemCrudTests(APITestCase):
    def setUp(self):
        self.menu = Menu.objects.create(nombre="Principal")
        self.item = Item.objects.create(nombre="Papipollo", precio="3.50", menu=self.menu)

    def test_admin_edita_menu(self):
        r = _cli().patch(f"/menus/{self.menu.id}/", {"nombre": "Carta"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.menu.refresh_from_db()
        self.assertEqual(self.menu.nombre, "Carta")

    def test_admin_edita_producto_sin_cambiar_imagen(self):
        r = _cli().patch(f"/items/{self.item.id}/",
                         {"nombre": "Papipollo XL", "precio": "4.00", "estado": "INACTIVO"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.item.refresh_from_db()
        self.assertEqual((self.item.nombre, str(self.item.precio), self.item.estado),
                         ("Papipollo XL", "4.00", "INACTIVO"))

    def test_menu_con_productos_no_se_borra_y_explica_por_que(self):
        r = _cli().delete(f"/menus/{self.menu.id}/")
        self.assertEqual(r.status_code, 409, r.content)
        self.assertIn("productos", r.json()["detail"])
        self.assertTrue(Menu.objects.filter(id=self.menu.id).exists())

    def test_menu_vacio_si_se_borra(self):
        vacio = Menu.objects.create(nombre="Vacío")
        self.assertEqual(_cli().delete(f"/menus/{vacio.id}/").status_code, 204)

    def test_producto_sin_ventas_se_borra(self):
        self.assertEqual(_cli().delete(f"/items/{self.item.id}/").status_code, 204)

    def test_producto_con_ventas_no_se_borra_y_sugiere_desactivar(self):
        v = Venta.objects.create(franquicia_id=1, fecha_venta="2026-11-27",
                                 metodo_pago="EFECTIVO", monto_total="3.50")
        DetalleVenta.objects.create(venta=v, item=self.item, cantidad=1,
                                    precio_unitario="3.50", subtotal="3.50")
        r = _cli().delete(f"/items/{self.item.id}/")
        self.assertEqual(r.status_code, 409, r.content)
        self.assertIn("Desactívalo", r.json()["detail"])
        self.assertTrue(Item.objects.filter(id=self.item.id).exists())

    def test_franquicia_no_puede_editar_ni_borrar(self):
        f = _cli("FRANQUICIA", 1)
        self.assertEqual(f.patch(f"/items/{self.item.id}/", {"nombre": "x"}, format="json").status_code, 403)
        self.assertEqual(f.delete(f"/items/{self.item.id}/").status_code, 403)
        self.assertEqual(f.delete(f"/menus/{self.menu.id}/").status_code, 403)
