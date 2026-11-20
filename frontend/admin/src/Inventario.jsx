import { useEffect, useState } from "react";
import { Store, Warehouse, ArrowRightLeft, AlertTriangle, PackageX } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Modal, Pill } from "./ui";

const low = (u) => (u ? u.toLowerCase() : "");

function semaforo(cant, umbral) {
  const c = Number(cant), u = Number(umbral || 0);
  if (c <= u) return { tono: "bg-red-500", texto: "Crítico", pill: "bad" };
  if (c <= u * 2) return { tono: "bg-amber-500", texto: "Bajo", pill: "warn" };
  return { tono: "bg-green-500", texto: "OK", pill: "ok" };
}

export default function Inventario() {
  const [inv, setInv] = useState([]);
  const [franquicias, setFranquicias] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [abierta, setAbierta] = useState(null); // franquicia seleccionada
  const [form, setForm] = useState({ materia_prima_id: "", cantidad: "", umbral: "" });
  const [msg, setMsg] = useState("");

  async function cargar() {
    setInv(await (await api.get("/franquicias/inventario/")).json());
    setFranquicias(await (await api.get("/franquicias/franquicias/")).json());
    setMaterias(await (await api.get("/franquicias/materias-primas/")).json());
  }
  useEffect(() => { cargar(); }, []);

  const invDe = (fid) => inv.filter((i) => i.franquicia_id === fid);
  const bajosDe = (fid) => invDe(fid).filter((i) => Number(i.cantidad_actual) <= Number(i.umbral_minimo)).length;

  function abrir(f) {
    setAbierta(f);
    setForm({ materia_prima_id: "", cantidad: "", umbral: "" });
    setMsg("");
  }

  async function transferir(e) {
    e.preventDefault(); setMsg("");
    const res = await api.post("/franquicias/inventario/transferir/", {
      franquicia_id: abierta.id,
      materia_prima_id: Number(form.materia_prima_id),
      cantidad: form.cantidad,
      umbral: form.umbral || undefined,
    });
    if (res.ok) {
      setForm({ materia_prima_id: "", cantidad: "", umbral: "" });
      await cargar();
      setMsg("ok");
    } else {
      setMsg((await res.json()).detail || "No se pudo transferir.");
    }
  }

  const mpSel = materias.find((m) => m.id === Number(form.materia_prima_id));
  const invAbierta = abierta ? invDe(abierta.id) : [];

  return (
    <div className="space-y-6">
      {/* Bodega general (informativa) */}
      <Card className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-ink/5 p-3 text-ink"><Warehouse size={22} /></div>
          <div>
            <div className="text-base font-semibold">Bodega general</div>
            <div className="text-sm text-ink/50">{materias.length} insumos · surte a las franquicias. Gestiónala en la sección <b>Bodega general</b>.</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {materias.filter((m) => Number(m.stock_central) <= 0).length > 0 && (
            <Pill tone="bad">{materias.filter((m) => Number(m.stock_central) <= 0).length} sin stock en bodega</Pill>
          )}
        </div>
      </Card>

      {/* Tarjetas por franquicia */}
      <div>
        <h3 className="mb-3 text-base font-semibold">Inventario por franquicia</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {franquicias.map((f) => {
            const n = invDe(f.id).length;
            const bajos = bajosDe(f.id);
            return (
              <button
                key={f.id}
                onClick={() => abrir(f)}
                className="flex items-center gap-3 rounded-xl border border-sand bg-white p-4 text-left shadow-sm transition hover:border-brand hover:shadow"
              >
                {f.logo ? (
                  <img src={f.logo} alt="" className="h-12 w-12 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sand text-ink/40"><Store size={22} /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.nombre}</div>
                  <div className="text-xs text-ink/50">{n} insumo{n !== 1 ? "s" : ""} asignado{n !== 1 ? "s" : ""}</div>
                </div>
                {bajos > 0 ? (
                  <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600"><AlertTriangle size={12} /> {bajos}</span>
                ) : n > 0 ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                ) : (
                  <span className="text-xs text-ink/30">vacío</span>
                )}
              </button>
            );
          })}
          {franquicias.length === 0 && <p className="text-sm text-ink/40">No hay franquicias registradas.</p>}
        </div>
      </div>

      {/* Detalle de franquicia */}
      <Modal
        open={!!abierta}
        onClose={() => setAbierta(null)}
        title={abierta?.nombre || ""}
        size="xl"
      >
        {/* Asignar desde la bodega general */}
        <div className="mb-5 rounded-xl border border-sand bg-sand/20 p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ArrowRightLeft size={16} className="text-brand" /> Asignar insumo desde la bodega general</h4>
          <form onSubmit={transferir} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label="Insumo" req>
                <Select value={form.materia_prima_id} onChange={(e) => setForm({ ...form, materia_prima_id: e.target.value })} required>
                  <option value="">Selecciona…</option>
                  {materias.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre} — bodega: {Number(m.stock_central)} {low(m.unidad)}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={`Cantidad ${mpSel ? `(${low(mpSel.unidad)})` : ""}`} req>
              <Input type="number" step="0.001" min="0.001" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required />
            </Field>
            <Field label="Umbral mínimo">
              <Input type="number" step="0.001" value={form.umbral} onChange={(e) => setForm({ ...form, umbral: e.target.value })} placeholder="Opcional" />
            </Field>
            <div className="sm:col-span-4 flex items-center justify-between">
              <div>
                {mpSel && <span className="text-xs text-ink/50">Disponible en bodega: <b>{Number(mpSel.stock_central)} {low(mpSel.unidad)}</b></span>}
                {msg === "ok" && <span className="text-xs font-medium text-green-600">✓ Transferido.</span>}
                {msg && msg !== "ok" && <span className="text-xs font-medium text-red-500">{msg}</span>}
              </div>
              <Button type="submit"><ArrowRightLeft size={15} /> Transferir</Button>
            </div>
          </form>
        </div>

        {/* Inventario actual de la franquicia */}
        {invAbierta.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-ink/40">
            <PackageX size={26} />
            <p className="text-sm">Esta franquicia aún no tiene insumos. Asígnale desde la bodega general.</p>
          </div>
        ) : (
          <Table head={["Estado", "Insumo", "Cantidad", "Umbral"]}>
            {invAbierta.map((i) => {
              const s = semaforo(i.cantidad_actual, i.umbral_minimo);
              return (
                <tr key={i.id} className="border-b border-sand/60">
                  <td className="px-3 py-2"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${s.tono}`} /> <Pill tone={s.pill}>{s.texto}</Pill></span></td>
                  <td className="px-3 py-2 font-medium">{i.materia_prima_nombre}</td>
                  <td className="px-3 py-2"><b>{Number(i.cantidad_actual)}</b> <span className="text-ink/50">{low(i.materia_prima_unidad)}</span></td>
                  <td className="px-3 py-2 text-ink/50">{Number(i.umbral_minimo)} {low(i.materia_prima_unidad)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Modal>
    </div>
  );
}
