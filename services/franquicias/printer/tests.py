"""Tests de aislamiento por franquicia del sistema de impresión."""
from rest_framework.test import APIClient, APITestCase

from core.authentication import UsuarioJWT
from .models import Printer, PrintJob, PrinterAgentToken


def _usuario(franquicia_id, role="FRANQUICIA"):
    return UsuarioJWT({"sub": "1", "role": role, "franquicia_id": franquicia_id})


def _client_jwt(franquicia_id, role="FRANQUICIA"):
    c = APIClient()
    c.force_authenticate(user=_usuario(franquicia_id, role))
    return c


def _client_agente(token):
    c = APIClient()
    c.credentials(HTTP_X_PRINTER_TOKEN=token)
    return c


ORDEN = {
    "order_number": "7",
    "table_number": "3",
    "items": [
        {"name": "Hamburguesa", "quantity": 2, "price": 5.0, "note": "sin cebolla"},
        {"name": "Cola", "quantity": 1, "price": 1.5},
    ],
}


class AislamientoImpresionTests(APITestCase):
    def setUp(self):
        self.pa = Printer.objects.create(
            franquicia_id=1, name="Caja", connection_string="COM1")
        self.pb = Printer.objects.create(
            franquicia_id=2, name="Caja", connection_string="COM1")  # mismo nombre, otro local
        self.ag_a, self.tok_a = PrinterAgentToken.crear(1, "PC A")
        self.ag_b, self.tok_b = PrinterAgentToken.crear(2, "PC B")

    # ── POS (JWT) ──────────────────────────────────────────────────────
    def test_venta_crea_comanda_y_ticket_en_la_impresora_del_local(self):
        r = _client_jwt(1).post("/printer/print/order/sale/", ORDEN, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        jobs = PrintJob.objects.filter(franquicia_id=1)
        self.assertEqual(jobs.count(), 2)
        self.assertEqual({j.document_type for j in jobs}, {"kitchen_order", "receipt"})
        self.assertTrue(all(j.printer_id == self.pa.id for j in jobs))
        self.assertEqual(PrintJob.objects.filter(franquicia_id=2).count(), 0)

    def test_comanda_no_lleva_precios_y_ticket_si(self):
        _client_jwt(1).post("/printer/print/order/sale/", ORDEN, format="json")
        comanda = PrintJob.objects.get(document_type="kitchen_order").content
        ticket = PrintJob.objects.get(document_type="receipt")
        self.assertNotIn("$", comanda)
        self.assertIn("2x  Hamburguesa", comanda)
        self.assertIn("TOTAL", ticket.content)
        self.assertTrue(ticket.open_cash_drawer)

    def test_no_puede_imprimir_en_impresora_de_otra_franquicia(self):
        orden = {**ORDEN, "printer_id": str(self.pb.id)}
        _client_jwt(1).post("/printer/print/order/sale/", orden, format="json")
        # ignora el printer_id ajeno y usa la del propio local
        self.assertTrue(
            all(j.printer_id == self.pa.id for j in PrintJob.objects.all()))

    def test_listado_de_impresoras_y_trabajos_solo_de_mi_franquicia(self):
        _client_jwt(1).post("/printer/print/order/sale/", ORDEN, format="json")
        _client_jwt(2).post("/printer/print/order/sale/", ORDEN, format="json")
        imp = _client_jwt(1).get("/printer/printers/").json()
        self.assertEqual([p["franquicia_id"] for p in imp], [1])
        jobs = _client_jwt(1).get("/printer/jobs/").json()
        self.assertEqual({j["franquicia_id"] for j in jobs}, {1})

    def test_crear_impresora_ignora_franquicia_id_enviada(self):
        r = _client_jwt(1).post("/printer/printers/", {
            "name": "Cocina", "connection_string": "COM2", "franquicia_id": 2,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Printer.objects.get(name="Cocina").franquicia_id, 1)

    def test_sin_autenticar_se_rechaza(self):
        r = APIClient().post("/printer/print/order/sale/", ORDEN, format="json")
        self.assertIn(r.status_code, (401, 403))

    # ── Agente (X-Printer-Token) ───────────────────────────────────────
    def test_agente_solo_recibe_trabajos_de_su_franquicia(self):
        _client_jwt(1).post("/printer/print/order/sale/", ORDEN, format="json")
        _client_jwt(2).post("/printer/print/order/sale/", ORDEN, format="json")

        ra = _client_agente(self.tok_a).get("/printer/agente/trabajos/").json()
        self.assertEqual(ra["franquicia_id"], 1)
        self.assertEqual(len(ra["trabajos"]), 2)
        ids_a = set(PrintJob.objects.filter(franquicia_id=1).values_list("id", flat=True))
        self.assertEqual({t["id"] for t in ra["trabajos"]}, {str(i) for i in ids_a})

        rb = _client_agente(self.tok_b).get("/printer/agente/trabajos/").json()
        self.assertEqual(len(rb["trabajos"]), 2)
        self.assertTrue(set(t["id"] for t in rb["trabajos"]).isdisjoint(
            t["id"] for t in ra["trabajos"]))

    def test_agente_sin_token_o_invalido_es_401(self):
        self.assertEqual(APIClient().get("/printer/agente/trabajos/").status_code, 401)
        self.assertEqual(
            _client_agente("token-falso").get("/printer/agente/trabajos/").status_code, 401)

    def test_token_revocado_deja_de_servir(self):
        self.ag_a.is_active = False
        self.ag_a.save()
        self.assertEqual(
            _client_agente(self.tok_a).get("/printer/agente/trabajos/").status_code, 401)

    def test_rotar_invalida_el_token_anterior(self):
        nuevo = self.ag_a.rotar()
        self.assertEqual(
            _client_agente(self.tok_a).get("/printer/agente/trabajos/").status_code, 401)
        self.assertEqual(
            _client_agente(nuevo).get("/printer/agente/trabajos/").status_code, 200)

    def test_agente_no_puede_reportar_resultado_de_trabajo_ajeno(self):
        _client_jwt(2).post("/printer/print/order/sale/", ORDEN, format="json")
        ajeno = PrintJob.objects.filter(franquicia_id=2).first()
        r = _client_agente(self.tok_a).post("/printer/agente/resultado/", {
            "trabajo_id": str(ajeno.id), "success": True}, format="json")
        self.assertEqual(r.status_code, 404)
        ajeno.refresh_from_db()
        self.assertEqual(ajeno.status, "pending")

    def test_token_se_guarda_solo_como_hash(self):
        self.assertNotEqual(self.ag_a.token_hash, self.tok_a)
        self.assertEqual(self.ag_a.token_hash, PrinterAgentToken.hash_token(self.tok_a))
        self.assertEqual(len(self.ag_a.token_hash), 64)


def _client_cajero(franquicia_id):
    c = APIClient()
    c.force_authenticate(user=UsuarioJWT({
        "sub": "9", "role": "FRANQUICIA", "sub_rol": "CAJERO",
        "franquicia_id": franquicia_id}))
    return c


class GestionDesdePanelTests(APITestCase):
    def test_admin_franquicia_registra_impresora_y_prueba_genera_trabajo(self):
        c = _client_jwt(1)
        r = c.post("/printer/printers/", {
            "name": "3nStar RPT004", "connection_type": "usb",
            "connection_string": "3nStar RPT004", "paper_width": 80,
            "characters_per_line": 42, "has_cash_drawer": True,
        }, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        pid = r.json()["id"]
        t = c.post(f"/printer/printers/{pid}/test_print/")
        self.assertEqual(t.status_code, 200, t.content)
        job = PrintJob.objects.get()
        self.assertEqual(job.franquicia_id, 1)
        self.assertIn("PRUEBA DE IMPRESION", job.content)

    def test_cajero_no_puede_crear_impresoras_ni_tokens(self):
        c = _client_cajero(1)
        self.assertEqual(c.post("/printer/printers/", {
            "name": "X", "connection_string": "X"}, format="json").status_code, 403)
        self.assertEqual(c.post("/printer/agent-tokens/", {}, format="json").status_code, 403)
        self.assertEqual(c.get("/printer/agent-tokens/").status_code, 403)

    def test_generar_token_listar_rotar_y_revocar(self):
        c = _client_jwt(1)
        r = c.post("/printer/agent-tokens/", {"nombre": "PC Caja"}, format="json")
        self.assertEqual(r.status_code, 201)
        token, tid = r.json()["token"], r.json()["id"]
        # el token funciona en el agente y resuelve a la franquicia 1
        self.assertEqual(_client_agente(token).get("/printer/agente/estado/").json()["franquicia_id"], 1)
        # el listado nunca expone el token ni el hash
        item = c.get("/printer/agent-tokens/").json()[0]
        self.assertNotIn("token", item)
        self.assertNotIn("token_hash", item)
        # rotar: el viejo deja de servir
        nuevo = c.post(f"/printer/agent-tokens/{tid}/rotar/").json()["token"]
        self.assertEqual(_client_agente(token).get("/printer/agente/estado/").status_code, 401)
        self.assertEqual(_client_agente(nuevo).get("/printer/agente/estado/").status_code, 200)
        # revocar
        c.post(f"/printer/agent-tokens/{tid}/revocar/")
        self.assertEqual(_client_agente(nuevo).get("/printer/agente/estado/").status_code, 401)

    def test_no_puede_gestionar_tokens_de_otra_franquicia(self):
        ag, _ = PrinterAgentToken.crear(2, "PC B")
        self.assertEqual(_client_jwt(1).get("/printer/agent-tokens/").json(), [])
        self.assertEqual(
            _client_jwt(1).post(f"/printer/agent-tokens/{ag.id}/rotar/").status_code, 404)

    def test_nombre_duplicado_en_la_misma_franquicia_da_400_no_500(self):
        c = _client_jwt(1)
        body = {"name": "Caja", "connection_string": "Caja"}
        self.assertEqual(c.post("/printer/printers/", body, format="json").status_code, 201)
        self.assertEqual(c.post("/printer/printers/", body, format="json").status_code, 400)
        # otra franquicia sí puede usar el mismo nombre
        self.assertEqual(_client_jwt(2).post("/printer/printers/", body, format="json").status_code, 201)


# ============================================================================
#  Regresiones encontradas en la revisión
# ============================================================================
from datetime import timedelta
from unittest import mock
from django.db.models import ProtectedError
from datetime import datetime, timezone as dtz
from django.utils import timezone as djtz


class RevisionTests(APITestCase):
    def setUp(self):
        self.p = Printer.objects.create(franquicia_id=1, name="Caja", connection_string="Caja")
        self.ag, self.tok = PrinterAgentToken.crear(1, "PC A")

    def _venta(self):
        _client_jwt(1).post("/printer/print/order/sale/", ORDEN, format="json")

    # 1. Un trabajo entregado al agente que nunca se confirma (PC apagado,
    #    corte de luz) se quedaba en 'printing' para siempre = ticket perdido.
    def test_trabajo_colgado_en_printing_se_reencola(self):
        self._venta()
        ra = _client_agente(self.tok).get("/printer/agente/trabajos/").json()
        self.assertEqual(len(ra["trabajos"]), 2)
        PrintJob.objects.update(started_at=djtz.now() - timedelta(minutes=10))
        rb = _client_agente(self.tok).get("/printer/agente/trabajos/").json()
        self.assertEqual(len(rb["trabajos"]), 2, "los trabajos colgados deben reentregarse")

    # 2. Si el trabajo ya fue reencolado y luego llega el éxito, debe cerrarse.
    def test_resultado_exitoso_cierra_trabajo_aunque_este_pending(self):
        self._venta()
        job = PrintJob.objects.filter(document_type="receipt").get()
        r = _client_agente(self.tok).post("/printer/agente/resultado/", {
            "trabajo_id": str(job.id), "success": True}, format="json")
        self.assertEqual(r.status_code, 200)
        job.refresh_from_db()
        self.assertEqual(job.status, "completed")

    # 3. Reportar dos veces el mismo éxito no debe duplicar el evento de caja.
    def test_resultado_duplicado_no_duplica_evento_de_caja(self):
        self._venta()
        _client_agente(self.tok).get("/printer/agente/trabajos/")
        job = PrintJob.objects.filter(document_type="receipt").get()
        for _ in range(2):
            _client_agente(self.tok).post("/printer/agente/resultado/", {
                "trabajo_id": str(job.id), "success": True}, format="json")
        self.assertEqual(job.cash_drawer_events.count(), 1)

    # 4. La configuración GLOBAL no debe poder editarla una franquicia.
    def test_franquicia_no_puede_modificar_settings_globales(self):
        r = _client_jwt(1).patch("/printer/settings/", {"company_name": "HACK"}, format="json")
        self.assertEqual(r.status_code, 403)

    # 5. Hora del ticket: el servidor está en UTC, el local en Ecuador (UTC-5).
    def test_hora_del_ticket_usa_zona_horaria_del_local(self):
        from .views import _hora_local
        utc = datetime(2026, 11, 26, 23, 30, tzinfo=dtz.utc)
        self.assertEqual(_hora_local(utc).strftime("%H:%M"), "18:30")
        orden = {**ORDEN, "printed_at": "2026-11-26T18:30:00-05:00"}
        _client_jwt(1).post("/printer/print/order/sale/", orden, format="json")
        self.assertIn("Hora: 18:30", PrintJob.objects.get(document_type="receipt").content)

    # 6. Pedido "para llevar": el POS no manda mesa (null) → no debe ser 400.
    def test_pedido_para_llevar_sin_mesa(self):
        orden = {**ORDEN, "table_number": None, "customer_name": None}
        r = _client_jwt(1).post("/printer/print/order/sale/", orden, format="json")
        self.assertEqual(r.status_code, 200, r.content)

    # 7. Borrar una impresora que ya imprimió → 409 claro, no 500.
    def test_borrar_impresora_con_trabajos_da_409(self):
        self._venta()
        r = _client_jwt(1).delete(f"/printer/printers/{self.p.id}/")
        self.assertEqual(r.status_code, 409, r.content)
        # sin trabajos sí se puede
        q = Printer.objects.create(franquicia_id=1, name="Otra", connection_string="x")
        self.assertEqual(_client_jwt(1).delete(f"/printer/printers/{q.id}/").status_code, 204)

    # 8. Si falla la 2ª pieza de la venta no debe quedar la comanda sola.
    def test_venta_es_atomica(self):
        real = PrintJob.objects.create
        llamadas = {"n": 0}

        def falla_en_la_segunda(*a, **k):
            llamadas["n"] += 1
            if llamadas["n"] == 2:
                raise RuntimeError("boom")
            return real(*a, **k)

        with mock.patch.object(PrintJob.objects, "create", side_effect=falla_en_la_segunda):
            try:
                _client_jwt(1).post("/printer/print/order/sale/", ORDEN, format="json")
            except RuntimeError:
                pass
        self.assertEqual(PrintJob.objects.count(), 0)

    # 9. Un cajero no debe poder borrar trabajos del historial.
    def test_cajero_no_puede_borrar_trabajos(self):
        self._venta()
        job = PrintJob.objects.first()
        self.assertEqual(_client_cajero(1).delete(f"/printer/jobs/{job.id}/").status_code, 403)

    # 10. Entrega concurrente: dos polls simultáneos no deben recibir el mismo trabajo.
    def test_un_trabajo_ya_reclamado_no_se_entrega_dos_veces(self):
        self._venta()
        a = _client_agente(self.tok).get("/printer/agente/trabajos/").json()
        b = _client_agente(self.tok).get("/printer/agente/trabajos/").json()
        self.assertEqual(len(a["trabajos"]), 2)
        self.assertEqual(len(b["trabajos"]), 0)


    def test_trabajo_incluye_datos_de_conexion_para_el_agente(self):
        Printer.objects.all().delete()
        Printer.objects.create(franquicia_id=1, name="Red", connection_type="network",
                               connection_string="192.168.1.50", port=9100)
        self._venta()
        t = _client_agente(self.tok).get("/printer/agente/trabajos/").json()["trabajos"][0]
        self.assertEqual(t["conexion"], {"tipo": "network", "host": "192.168.1.50", "puerto": 9100})
