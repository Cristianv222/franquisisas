import { useEffect, useRef, useState } from "react";
import { Settings, Plus, Check, Trash2, Grip } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select } from "./ui";
import MesaFigura from "./MesaFigura";

const FORMAS = [["CUADRADA", "Cuadrada"], ["REDONDA", "Redonda"], ["BARRA", "Barra"]];

export default function Config() {
  const [mesas, setMesas] = useState([]);
  const [sel, setSel] = useState(null); // key de la mesa seleccionada
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(true);
  const lienzo = useRef(null);
  const drag = useRef(null);

  async function cargar() {
    const r = await api.get("/franquicias/mesas/");
    const data = r.ok ? await r.json() : [];
    setMesas(data.map((m) => ({ ...m, key: `m${m.id}`, pos_x: Number(m.pos_x), pos_y: Number(m.pos_y) })));
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  function agregar() {
    const num = mesas.reduce((a, m) => Math.max(a, m.numero), 0) + 1;
    const nueva = { key: `new${Date.now()}`, numero: num, pos_x: 50, pos_y: 45, forma: "CUADRADA", capacidad: 4 };
    setMesas((ms) => [...ms, nueva]);
    setSel(nueva.key);
  }

  function actualizar(key, campos) {
    setMesas((ms) => ms.map((m) => (m.key === key ? { ...m, ...campos } : m)));
  }

  function eliminar(key) {
    setMesas((ms) => ms.filter((m) => m.key !== key));
    if (sel === key) setSel(null);
  }

  function posDesdeEvento(e) {
    const r = lienzo.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    return { pos_x: Math.min(95, Math.max(5, x)), pos_y: Math.min(93, Math.max(7, y)) };
  }

  function onPointerDownMesa(e, key) {
    e.preventDefault();
    setSel(key);
    drag.current = key;
    lienzo.current.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag.current) return;
    actualizar(drag.current, posDesdeEvento(e));
  }

  function onPointerUp() { drag.current = null; }

  async function guardar() {
    setMsg("");
    const payload = mesas.map(({ numero, pos_x, pos_y, forma, capacidad }) => ({
      numero, pos_x: Number(pos_x).toFixed(2), pos_y: Number(pos_y).toFixed(2), forma, capacidad,
    }));
    const res = await api.post("/franquicias/mesas/guardar/", { mesas: payload });
    if (res.ok) { setMsg("ok"); cargar(); }
    else { const d = await res.json(); setMsg(d.detail || "No se pudo guardar."); }
  }

  const mesaSel = mesas.find((m) => m.key === sel);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold"><Settings size={18} className="text-brand" /> Croquis del local</h3>
            <p className="text-sm text-ink/50">Agrega mesas y arrástralas a su lugar. En el POS elegirás la mesa tocándola en este mismo plano.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={agregar}><Plus size={16} /> Agregar mesa</Button>
            <Button onClick={guardar}><Check size={16} /> Guardar croquis</Button>
          </div>
        </div>

        {msg === "ok" && <p className="mb-3 text-sm font-medium text-green-600">✓ Croquis guardado.</p>}
        {msg && msg !== "ok" && <p className="mb-3 text-sm font-medium text-red-500">{msg}</p>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
          {/* Lienzo */}
          <div
            ref={lienzo}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className="relative aspect-[16/10] w-full touch-none overflow-hidden rounded-xl border border-sand bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:28px_28px]"
          >
            {cargando ? (
              <p className="p-6 text-sm text-ink/40">Cargando…</p>
            ) : mesas.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-ink/40">
                <Grip size={26} />
                <p className="text-sm">Pulsa "Agregar mesa" y arrástrala a su lugar.</p>
              </div>
            ) : (
              mesas.map((m) => (
                <MesaFigura
                  key={m.key}
                  mesa={m}
                  interactive
                  selected={sel === m.key}
                  dragging={drag.current === m.key}
                  onPointerDown={(e) => onPointerDownMesa(e, m.key)}
                />
              ))
            )}
          </div>

          {/* Panel de edición */}
          <div className="rounded-xl border border-sand p-4">
            {mesaSel ? (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Mesa seleccionada</h4>
                <Field label="Número"><Input type="number" min="1" value={mesaSel.numero} onChange={(e) => actualizar(sel, { numero: Number(e.target.value) })} /></Field>
                <Field label="Forma"><Select value={mesaSel.forma} onChange={(e) => actualizar(sel, { forma: e.target.value })}>{FORMAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                <Field label="Capacidad (personas)"><Input type="number" min="1" max="20" value={mesaSel.capacidad} onChange={(e) => actualizar(sel, { capacidad: Number(e.target.value) })} /></Field>
                <Button variant="danger" className="w-full" onClick={() => eliminar(sel)}><Trash2 size={15} /> Eliminar mesa</Button>
              </div>
            ) : (
              <p className="text-sm text-ink/40">Selecciona una mesa del croquis para editar su número, forma y capacidad.</p>
            )}
            <p className="mt-4 text-xs text-ink/40">Total: {mesas.length} mesa{mesas.length !== 1 ? "s" : ""}. Recuerda <b>Guardar croquis</b>.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
