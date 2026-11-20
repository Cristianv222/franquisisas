import { useEffect, useState } from "react";
import { Check, X, PackagePlus } from "lucide-react";
import { api } from "./api";
import { Card, Button, Table, Pill } from "./ui";

const TONO = { PENDIENTE: "warn", ATENDIDA: "ok", APROBADA: "ok", RECHAZADA: "bad" };
const low = (u) => (u ? u.toLowerCase() : "");

export default function Solicitudes() {
  const [lista, setLista] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [franquicias, setFranquicias] = useState([]);
  const [msg, setMsg] = useState("");

  async function cargar() {
    const r = await api.get("/franquicias/solicitudes/");
    setLista(r.ok ? await r.json() : []);
    const i = await api.get("/franquicias/solicitudes-insumo/");
    setInsumos(i.ok ? await i.json() : []);
    const f = await api.get("/franquicias/franquicias/");
    setFranquicias(f.ok ? await f.json() : []);
  }
  useEffect(() => { cargar(); }, []);

  const nombreFranq = (id) => franquicias.find((f) => f.id === id)?.nombre || `#${id}`;

  async function resolver(id, aprobar) {
    await api.post(`/franquicias/solicitudes/${id}/resolver/`, {
      aprobar,
      respuesta_admin: aprobar ? "Aprobado" : "Rechazado",
    });
    cargar();
  }

  async function resolverInsumo(id, aprobar) {
    setMsg("");
    const res = await api.post(`/franquicias/solicitudes-insumo/${id}/resolver/`, {
      aprobar,
      respuesta_admin: aprobar ? "Aprobado" : "Rechazado",
    });
    if (!res.ok) {
      const d = await res.json();
      setMsg(d.detail || "No se pudo aprobar (revisa el stock de la bodega general).");
    }
    cargar();
  }

  return (
    <div className="space-y-6">
      {/* Solicitudes de aumento de insumo */}
      <Card className="p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><PackagePlus size={18} className="text-brand" /> Solicitudes de insumo</h3>
        <p className="mb-4 text-sm text-ink/50">La franquicia pide que le aumentes el stock de un insumo. Al aprobar, se transfiere desde la <b>bodega general</b> (se bloquea si no alcanza).</p>
        {msg && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{msg}</p>}
        <Table head={["Franquicia", "Insumo", "Cantidad", "Razón", "Estado", ""]}>
          {insumos.map((s) => (
            <tr key={s.id} className="border-b border-sand/60">
              <td className="px-3 py-2 font-medium">{nombreFranq(s.franquicia_id)}</td>
              <td className="px-3 py-2">{s.materia_prima_nombre}</td>
              <td className="px-3 py-2"><b>{Number(s.cantidad)}</b> <span className="text-ink/50">{low(s.materia_prima_unidad)}</span></td>
              <td className="px-3 py-2 text-ink/60">{s.razon || "—"}</td>
              <td className="px-3 py-2"><Pill tone={TONO[s.estado] || "neutral"}>{s.estado}</Pill></td>
              <td className="px-3 py-2">
                {s.estado === "PENDIENTE" && (
                  <div className="flex gap-2">
                    <Button onClick={() => resolverInsumo(s.id, true)}><Check size={16} /> Aprobar</Button>
                    <Button variant="danger" onClick={() => resolverInsumo(s.id, false)}><X size={16} /> Rechazar</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {insumos.length === 0 && (
            <tr><td colSpan="6" className="px-3 py-6 text-center text-sm text-ink/40">Sin solicitudes de insumo.</td></tr>
          )}
        </Table>
      </Card>

      {/* Solicitudes de productos nuevos */}
      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Solicitudes de productos</h3>
        <Table head={["Franquicia", "Producto", "Precio", "Razón", "Estado", ""]}>
          {lista.map((s) => (
            <tr key={s.id} className="border-b border-sand/60">
              <td className="px-3 py-2">{nombreFranq(s.franquicia_id)}</td>
              <td className="px-3 py-2 font-medium">{s.nombre}</td>
              <td className="px-3 py-2">${s.precio}</td>
              <td className="px-3 py-2 text-ink/60">{s.razon}</td>
              <td className="px-3 py-2"><Pill tone={TONO[s.estado] || "neutral"}>{s.estado}</Pill></td>
              <td className="px-3 py-2">
                {s.estado === "PENDIENTE" && (
                  <div className="flex gap-2">
                    <Button onClick={() => resolver(s.id, true)}><Check size={16} /> Aprobar</Button>
                    <Button variant="danger" onClick={() => resolver(s.id, false)}><X size={16} /> Rechazar</Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {lista.length === 0 && (
            <tr><td colSpan="6" className="px-3 py-6 text-center text-sm text-ink/40">Sin solicitudes.</td></tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
