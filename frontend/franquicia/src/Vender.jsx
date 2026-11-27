import { useEffect, useMemo, useState } from "react";
import {
  ShoppingCart, Plus, Minus, Check, AlertCircle, Banknote, ArrowLeftRight,
  QrCode, CreditCard, User, UserPlus, X, Utensils, ShoppingBag, Search,
} from "lucide-react";
import { api } from "./api";
import { Card, Button, Select, Modal, Field, Input } from "./ui";
import MesaFigura from "./MesaFigura";

const METODOS = [
  ["EFECTIVO", "Efectivo", Banknote],
  ["TRANSFERENCIA", "Transferencia", ArrowLeftRight],
  ["DEUNA", "De una (QR)", QrCode],
  ["TARJETA", "Tarjeta", CreditCard],
];

export default function Vender() {
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({});
  const [metodo, setMetodo] = useState("EFECTIVO");
  const [recibido, setRecibido] = useState("");
  const [msg, setMsg] = useState(null);
  const [mesas, setMesas] = useState([]);

  // Entrega
  const [entrega, setEntrega] = useState("MESA"); // MESA | LLEVAR
  const [mesa, setMesa] = useState("");

  // Cliente
  const [cliente, setCliente] = useState(null); // null = Consumidor Final
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [regOpen, setRegOpen] = useState(false);
  const [nuevo, setNuevo] = useState({ cedula: "", nombre: "", telefono: "" });
  const [regMsg, setRegMsg] = useState("");

  const hoy = new Date().toISOString().slice(0, 10);

  async function cargar() {
    const i = await api.get("/franquicias/items/disponibles/");
    setItems(i.ok ? await i.json() : []);
    const m = await api.get("/franquicias/mesas/");
    setMesas(m.ok ? (await m.json()).map((x) => ({ ...x, pos_x: Number(x.pos_x), pos_y: Number(x.pos_y) })) : []);
  }
  useEffect(() => { cargar(); }, []);

  // Búsqueda de clientes con pequeño debounce.
  useEffect(() => {
    if (busqueda.trim().length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      const r = await api.get(`/franquicias/clientes/?q=${encodeURIComponent(busqueda.trim())}`);
      setResultados(r.ok ? await r.json() : []);
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda]);

  const add = (id) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const sub = (id) => setCart((c) => { const n = { ...c }; n[id] = (n[id] || 0) - 1; if (n[id] <= 0) delete n[id]; return n; });
  const lineas = Object.entries(cart).map(([id, q]) => ({ item: Number(id), cantidad: q }));
  const total = lineas.reduce((a, l) => { const it = items.find((i) => i.id === l.item); return a + (it ? Number(it.precio) * l.cantidad : 0); }, 0);

  const vuelto = useMemo(() => {
    const r = parseFloat(recibido);
    if (metodo !== "EFECTIVO" || isNaN(r)) return null;
    return r - total;
  }, [recibido, total, metodo]);

  function seleccionarCliente(c) {
    setCliente(c);
    setBusqueda("");
    setResultados([]);
  }

  async function registrarCliente(e) {
    e.preventDefault(); setRegMsg("");
    if (!nuevo.nombre.trim()) { setRegMsg("El nombre es obligatorio."); return; }
    const res = await api.post("/franquicias/clientes/", nuevo);
    const d = await res.json();
    if (res.ok) { seleccionarCliente(d); setRegOpen(false); setNuevo({ cedula: "", nombre: "", telefono: "" }); }
    else setRegMsg(d.cedula?.[0] || "No se pudo registrar el cliente.");
  }

  async function vender() {
    setMsg(null);
    if (lineas.length === 0) { setMsg({ err: "Agrega al menos un producto." }); return; }
    if (entrega === "MESA" && mesas.length > 0 && !mesa) { setMsg({ err: "Selecciona la mesa en el croquis." }); return; }
    if (metodo === "EFECTIVO" && recibido !== "" && vuelto < 0) { setMsg({ err: "El monto recibido no cubre el total." }); return; }

    const body = {
      fecha_venta: hoy,
      metodo_pago: metodo,
      detalles: lineas,
      tipo_entrega: entrega,
      mesa: entrega === "MESA" && mesa ? Number(mesa) : null,
      cliente: cliente ? cliente.id : null,
      monto_recibido: metodo === "EFECTIVO" && recibido !== "" ? recibido : null,
    };
    const res = await api.post("/franquicias/ventas/", body);
    const d = await res.json();
    if (res.ok) {
      const v = d.vuelto != null ? ` · Vuelto: $${Number(d.vuelto).toFixed(2)}` : "";
      const imp = d.impresion;
      const impresa = imp?.estado === "encolada";
      setMsg({
        ok: `Orden #${d.numero_orden} registrada por $${d.monto_total}${v}.${impresa ? " Imprimiendo ticket y comanda…" : ""}`,
        aviso: imp && !impresa ? `La venta se guardó, pero no se imprimió: ${imp.detalle}` : null,
      });
      setCart({}); setRecibido(""); setMesa(""); setCliente(null);
      cargar();
    } else setMsg({ err: d.detail || JSON.stringify(d) });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:h-full lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)]">
      {/* Productos: es lo unico que se desplaza */}
      <div className="lg:col-span-2 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((it) => (
            <button
              key={it.id}
              disabled={!it.disponible}
              onClick={() => add(it.id)}
              className={`relative overflow-hidden rounded-xl border bg-white text-left shadow-sm transition ${
                it.disponible ? "border-sand hover:border-brand hover:shadow" : "border-sand opacity-50"
              }`}
            >
              {it.imagen ? <img src={it.imagen} alt="" className="h-28 w-full object-cover" /> : <div className="h-28 w-full bg-sand" />}
              {cart[it.id] && <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">{cart[it.id]}</span>}
              <div className="p-3">
                <div className="truncate font-medium">{it.nombre}</div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-brand">${it.precio}</span>
                  {!it.disponible && (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-500">
                      <AlertCircle size={13} /> {it.sin_receta ? "Sin receta" : "Sin stock"}
                    </span>
                  )}
                </div>
                {!it.disponible && it.faltantes?.length > 0 && (
                  <div className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] leading-tight text-red-600">
                    Falta: {it.faltantes.join(", ")}
                  </div>
                )}
              </div>
            </button>
          ))}
          {items.length === 0 && <p className="col-span-full text-sm text-ink/40">No hay productos asignados a tu franquicia todavía.</p>}
        </div>
      </div>

      {/* Orden */}
      <Card className="flex h-fit flex-col p-0 lg:h-full lg:min-h-0 lg:overflow-hidden">
       <div className="p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><ShoppingCart size={18} className="text-brand" /> Orden</h3>

        {/* Entrega */}
        <div className="mb-3">
          <div className="mb-1 flex gap-2">
            <button onClick={() => setEntrega("MESA")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm ${entrega === "MESA" ? "border-brand bg-brand/10 text-brand" : "border-sand text-ink/60"}`}><Utensils size={14} /> Mesa</button>
            <button onClick={() => setEntrega("LLEVAR")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm ${entrega === "LLEVAR" ? "border-brand bg-brand/10 text-brand" : "border-sand text-ink/60"}`}><ShoppingBag size={14} /> Para llevar</button>
          </div>
          {entrega === "MESA" && (
            mesas.length > 0 ? (
              <>
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-sand bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:24px_24px]">
                  {mesas.map((m) => (
                    <MesaFigura
                      key={m.id}
                      mesa={m}
                      interactive
                      selected={Number(mesa) === m.numero}
                      onClick={() => setMesa(m.numero)}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-ink/40">{mesa ? `Mesa ${mesa} seleccionada.` : "Toca una mesa en el croquis."}</p>
              </>
            ) : (
              <p className="text-xs text-ink/40">No has configurado mesas (ve a Configuración).</p>
            )
          )}
        </div>

        {/* Cliente */}
        <div className="mb-3">
          {cliente ? (
            <div className="flex items-center justify-between rounded-lg border border-sand bg-sand/30 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium"><User size={14} className="text-brand" /> {cliente.nombre}</div>
                {cliente.cedula && <div className="text-xs text-ink/50">CI: {cliente.cedula}</div>}
              </div>
              <button onClick={() => setCliente(null)} className="text-ink/40 hover:text-red-500" title="Quitar"><X size={16} /></button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Cliente: cédula o nombre…"
                    className="w-full rounded-lg border border-sand bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-brand"
                  />
                </div>
                <Button variant="outline" className="shrink-0 px-2.5" onClick={() => { setRegOpen(true); setRegMsg(""); }} title="Registrar cliente"><UserPlus size={16} /></Button>
              </div>
              {resultados.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-sand bg-white shadow-lg">
                  {resultados.map((c) => (
                    <button key={c.id} onClick={() => seleccionarCliente(c)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sand/40">
                      <span className="font-medium">{c.nombre}</span>
                      {c.cedula && <span className="text-xs text-ink/50">{c.cedula}</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[11px] text-ink/40">Sin cliente = Consumidor Final.</p>
            </div>
          )}
        </div>

        {/* Líneas */}
        <div className="space-y-2">
          {lineas.map((l) => {
            const it = items.find((i) => i.id === l.item);
            return (
              <div key={l.item} className="flex items-center justify-between text-sm">
                <span className="mr-2 truncate">{it?.nombre}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => sub(l.item)} className="rounded bg-sand p-1 hover:bg-sand/70"><Minus size={14} /></button>
                  <span className="w-5 text-center">{l.cantidad}</span>
                  <button onClick={() => add(l.item)} className="rounded bg-sand p-1 hover:bg-sand/70"><Plus size={14} /></button>
                </div>
              </div>
            );
          })}
          {lineas.length === 0 && <p className="text-sm text-ink/40">Toca un producto para agregarlo.</p>}
        </div>

        <div className="my-4 border-t border-sand" />

        {/* Método de pago */}
        <label className="mb-1 block text-xs font-medium text-ink/60">Método de pago</label>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {METODOS.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setMetodo(k)} className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm ${metodo === k ? "border-brand bg-brand/10 text-brand" : "border-sand text-ink/60 hover:border-brand/40"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* Calculadora de vuelto */}
        {metodo === "EFECTIVO" && (
          <div className="mb-3 rounded-lg border border-sand bg-sand/20 p-3">
            <label className="mb-1 block text-xs font-medium text-ink/60">Monto recibido</label>
            <Input type="number" step="0.01" min="0" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder="Ej. 20.00" />
            {vuelto != null && (
              <div className={`mt-2 flex items-center justify-between text-sm ${vuelto < 0 ? "text-red-500" : "text-green-600"}`}>
                <span>Vuelto</span>
                <span className="text-lg font-bold">{vuelto < 0 ? "Falta $" + Math.abs(vuelto).toFixed(2) : "$" + vuelto.toFixed(2)}</span>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[5, 10, 20, 50].map((b) => (
                <button key={b} onClick={() => setRecibido(String(b))} className="rounded-md bg-white px-2 py-1 text-xs text-ink/70 ring-1 ring-sand hover:ring-brand">${b}</button>
              ))}
              <button onClick={() => setRecibido(total.toFixed(2))} className="rounded-md bg-white px-2 py-1 text-xs text-ink/70 ring-1 ring-sand hover:ring-brand">Exacto</button>
            </div>
          </div>
        )}

       </div>

       {/* Pie fijo: el total y el boton de cobrar siempre a la vista */}
       <div className="shrink-0 border-t border-sand bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-ink/60">Total</span>
          <span className="text-2xl font-bold">${total.toFixed(2)}</span>
        </div>
        <Button onClick={vender} className="w-full"><Check size={16} /> Registrar venta</Button>
        {msg?.ok && <p className="mt-3 text-sm text-green-600">{msg.ok}</p>}
        {msg?.aviso && <p className="mt-1 text-sm text-amber-600">{msg.aviso}</p>}
        {msg?.err && <p className="mt-3 text-sm text-red-500">{msg.err}</p>}
       </div>
      </Card>

      {/* Modal registrar cliente */}
      <Modal
        open={regOpen}
        onClose={() => setRegOpen(false)}
        title="Registrar cliente"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegOpen(false)}>Cancelar</Button>
            <Button onClick={registrarCliente}><UserPlus size={16} /> Guardar</Button>
          </>
        }
      >
        <form onSubmit={registrarCliente} className="space-y-3">
          <Field label="Nombre"><Input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required autoFocus /></Field>
          <Field label="Cédula"><Input value={nuevo.cedula} onChange={(e) => setNuevo({ ...nuevo, cedula: e.target.value })} placeholder="Opcional" /></Field>
          <Field label="Teléfono"><Input value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} placeholder="Opcional" /></Field>
          {regMsg && <p className="text-sm text-red-500">{regMsg}</p>}
        </form>
      </Modal>
    </div>
  );
}
