import { useEffect, useState } from "react";
import { Boxes, RefreshCw, TrendingUp } from "lucide-react";
import { api } from "./api";
import { Card, Table, Pill, Button, Field, Input, Modal } from "./ui";

const low = (u) => (u ? u.toLowerCase() : "");

// Semáforo: rojo si <= umbral, amarillo si <= umbral*2, verde en otro caso.
function semaforo(cant, umbral) {
  const c = Number(cant);
  const u = Number(umbral);
  if (c <= u) return { tone: "bad", dot: "bg-red-500", txt: "Bajo" };
  if (c <= u * 2) return { tone: "warn", dot: "bg-amber-500", txt: "Medio" };
  return { tone: "ok", dot: "bg-green-500", txt: "Óptimo" };
}

const TONO = { PENDIENTE: "warn", APROBADA: "ok", RECHAZADA: "bad" };

export default function Inventario() {
  const [filas, setFilas] = useState([]);
  const [solis, setSolis] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [pedir, setPedir] = useState(null); // fila en la que se pide aumento
  const [form, setForm] = useState({ cantidad: "", razon: "" });
  const [msg, setMsg] = useState("");

  async function cargar() {
    setCargando(true);
    const r = await api.get("/franquicias/inventario/");
    setFilas(r.ok ? await r.json() : []);
    const s = await api.get("/franquicias/solicitudes-insumo/");
    setSolis(s.ok ? await s.json() : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  function abrirPedir(fila) {
    setPedir(fila);
    setForm({ cantidad: "", razon: "" });
    setMsg("");
  }

  async function solicitar(e) {
    e.preventDefault(); setMsg("");
    const res = await api.post("/franquicias/solicitudes-insumo/", {
      materia_prima: pedir.materia_prima,
      cantidad: form.cantidad,
      razon: form.razon,
    });
    if (res.ok) { setPedir(null); cargar(); }
    else setMsg("No se pudo enviar la solicitud.");
  }

  const pendientes = solis.filter((s) => s.estado === "PENDIENTE");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/60">
          Insumos disponibles en tu franquicia. Si te falta algo, pide un aumento y el administrador te lo surtirá.
        </p>
        <button onClick={cargar} className="flex items-center gap-1.5 rounded-lg bg-sand/60 px-3 py-1.5 text-sm text-ink hover:bg-sand" title="Actualizar">
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      <Card className="p-5">
        {cargando ? (
          <p className="py-8 text-center text-sm text-ink/40">Cargando…</p>
        ) : filas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-ink/40">
            <Boxes size={28} />
            <p className="text-sm">Aún no tienes insumos cargados. Solicita al administrador que te asigne stock.</p>
          </div>
        ) : (
          <Table head={["Insumo", "Disponible", "Umbral mínimo", "Estado", ""]}>
            {filas.map((f) => {
              const s = semaforo(f.cantidad_actual, f.umbral_minimo);
              const pend = pendientes.find((p) => p.materia_prima === f.materia_prima);
              return (
                <tr key={f.id} className="border-b border-sand/50 last:border-0">
                  <td className="px-3 py-2.5 font-medium">{f.materia_prima_nombre}</td>
                  <td className="px-3 py-2.5">
                    {Number(f.cantidad_actual)} <span className="text-ink/40">{low(f.materia_prima_unidad)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-ink/60">
                    {Number(f.umbral_minimo)} {low(f.materia_prima_unidad)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                      <Pill tone={s.tone}>{s.txt}</Pill>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {pend ? (
                      <Pill tone="warn">Solicitud pendiente</Pill>
                    ) : (
                      <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => abrirPedir(f)}>
                        <TrendingUp size={14} /> Solicitar aumento
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* Historial de solicitudes */}
      {solis.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Mis solicitudes de insumo</h3>
          <Table head={["Insumo", "Cantidad", "Razón", "Estado"]}>
            {solis.map((s) => (
              <tr key={s.id} className="border-b border-sand/50 last:border-0">
                <td className="px-3 py-2">{s.materia_prima_nombre}</td>
                <td className="px-3 py-2">{Number(s.cantidad)} {low(s.materia_prima_unidad)}</td>
                <td className="px-3 py-2 text-ink/60">{s.razon || "—"}</td>
                <td className="px-3 py-2"><Pill tone={TONO[s.estado] || "neutral"}>{s.estado}</Pill></td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Modal solicitar aumento */}
      <Modal
        open={!!pedir}
        onClose={() => setPedir(null)}
        title={`Solicitar aumento — ${pedir?.materia_prima_nombre || ""}`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPedir(null)}>Cancelar</Button>
            <Button onClick={solicitar}><TrendingUp size={16} /> Enviar solicitud</Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink/60">
          Disponible ahora: <b>{Number(pedir?.cantidad_actual || 0)} {low(pedir?.materia_prima_unidad)}</b>. El administrador revisará tu solicitud.
        </p>
        <form onSubmit={solicitar} className="space-y-3">
          <Field label={`Cantidad que necesitas (${low(pedir?.materia_prima_unidad)})`}>
            <Input type="number" step="0.001" min="0.001" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required autoFocus />
          </Field>
          <Field label="Motivo (opcional)">
            <Input value={form.razon} onChange={(e) => setForm({ ...form, razon: e.target.value })} placeholder="Ej. alta demanda del fin de semana" />
          </Field>
          {msg && <p className="text-sm text-red-500">{msg}</p>}
        </form>
      </Modal>
    </div>
  );
}
