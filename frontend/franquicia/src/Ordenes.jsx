import { useEffect, useState } from "react";
import { Receipt, RefreshCw, Utensils, ShoppingBag, User, Clock } from "lucide-react";
import { api } from "./api";
import { Card, Modal, Pill } from "./ui";

const METODO = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  DEUNA: "De una (QR)",
  TARJETA: "Tarjeta",
};

const hora = (iso) => {
  try { return new Date(iso).toLocaleString("es-EC", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
};

function entregaLabel(v) {
  if (v.tipo_entrega === "LLEVAR") return { icon: ShoppingBag, txt: "Para llevar" };
  return { icon: Utensils, txt: v.mesa ? `Mesa ${v.mesa}` : "En mesa" };
}

export default function Ordenes() {
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState(null);

  async function cargar() {
    setCargando(true);
    const r = await api.get("/franquicias/ventas/");
    setVentas(r.ok ? await r.json() : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/60">Órdenes cobradas. Toca una para ver su detalle.</p>
        <button onClick={cargar} className="flex items-center gap-1.5 rounded-lg bg-sand/60 px-3 py-1.5 text-sm text-ink hover:bg-sand"><RefreshCw size={14} /> Actualizar</button>
      </div>

      {cargando ? (
        <p className="py-8 text-center text-sm text-ink/40">Cargando…</p>
      ) : ventas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-ink/40">
          <Receipt size={28} />
          <p className="text-sm">Aún no hay órdenes registradas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ventas.map((v) => {
            const e = entregaLabel(v);
            return (
              <button key={v.id} onClick={() => setSel(v)} className="rounded-xl border border-sand bg-white p-4 text-left shadow-sm transition hover:border-brand hover:shadow">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold">Orden #{v.numero_orden ?? v.id}</span>
                  <span className="text-xl font-bold text-brand">${v.monto_total}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/60">
                  <span className="inline-flex items-center gap-1"><e.icon size={13} /> {e.txt}</span>
                  <span className="inline-flex items-center gap-1"><Clock size={13} /> {hora(v.creado_en)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs text-ink/50"><User size={12} /> {v.cliente_nombre}</span>
                  <Pill tone="neutral">{METODO[v.metodo_pago] || v.metodo_pago}</Pill>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detalle */}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Orden #${sel.numero_orden ?? sel.id}` : ""} size="md">
        {sel && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-ink/40">Entrega</div><div className="font-medium">{entregaLabel(sel).txt}</div></div>
              <div><div className="text-xs text-ink/40">Pago</div><div className="font-medium">{METODO[sel.metodo_pago] || sel.metodo_pago}</div></div>
              <div><div className="text-xs text-ink/40">Cliente</div><div className="font-medium">{sel.cliente_nombre}{sel.cliente_cedula ? ` · ${sel.cliente_cedula}` : ""}</div></div>
              <div><div className="text-xs text-ink/40">Fecha</div><div className="font-medium">{hora(sel.creado_en)}</div></div>
            </div>

            <div className="rounded-xl border border-sand">
              {sel.detalles?.map((d) => (
                <div key={d.id} className="flex items-center justify-between border-b border-sand/60 px-4 py-2 text-sm last:border-0">
                  <span><b>{d.cantidad}×</b> {d.item_nombre}</span>
                  <span className="text-ink/60">${d.subtotal}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between text-base font-bold"><span>Total</span><span className="text-brand">${sel.monto_total}</span></div>
              {sel.monto_recibido != null && (
                <>
                  <div className="flex items-center justify-between text-ink/60"><span>Recibido</span><span>${sel.monto_recibido}</span></div>
                  <div className="flex items-center justify-between text-ink/60"><span>Vuelto</span><span>${Number(sel.vuelto).toFixed(2)}</span></div>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
