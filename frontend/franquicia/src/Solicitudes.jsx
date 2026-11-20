import { useEffect, useState } from "react";
import { Send, ImagePlus } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Table, Pill } from "./ui";

const TONO = { PENDIENTE: "warn", ATENDIDA: "ok", APROBADA: "ok", RECHAZADA: "bad" };

export default function Solicitudes() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [razon, setRazon] = useState("");
  const [imagen, setImagen] = useState(null);
  const [msg, setMsg] = useState(null);

  async function cargar() {
    const r = await api.get("/franquicias/solicitudes/");
    setLista(r.ok ? await r.json() : []);
  }
  useEffect(() => { cargar(); }, []);

  async function enviar(e) {
    e.preventDefault();
    setMsg(null);
    if (!imagen) { setMsg({ err: "La imagen es obligatoria." }); return; }
    const fd = new FormData();
    fd.append("nombre", nombre);
    fd.append("precio", precio);
    fd.append("razon", razon);
    fd.append("imagen", imagen);
    const res = await api.postForm("/franquicias/solicitudes/", fd);
    if (res.ok) {
      setMsg({ ok: "Solicitud enviada al administrador." });
      setNombre(""); setPrecio(""); setRazon(""); setImagen(null);
      e.target.reset();
      cargar();
    } else {
      setMsg({ err: JSON.stringify(await res.json()) });
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-1 text-base font-semibold">Solicitar un producto nuevo</h3>
        <p className="mb-4 text-sm text-ink/50">Solo el administrador puede agregar productos; tú envías la solicitud con los datos.</p>
        <form onSubmit={enviar}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nombre del producto"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></Field>
            <Field label="Precio sugerido ($)"><Input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required /></Field>
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium text-ink/60">Razón</span>
            <textarea value={razon} onChange={(e) => setRazon(e.target.value)} required rows={3}
              className="w-full rounded-lg border border-sand px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-xs font-medium text-ink/60">Imagen (obligatoria · máx 2 MB · JPG/PNG/WebP)</span>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-sand px-4 py-3 text-sm text-ink/60 hover:bg-sand/30">
              <ImagePlus size={18} className="text-brand" />
              {imagen ? imagen.name : "Elegir imagen…"}
              <input type="file" accept="image/*" required className="hidden" onChange={(e) => setImagen(e.target.files[0])} />
            </label>
          </div>
          <div className="mt-4"><Button type="submit"><Send size={16} /> Enviar solicitud</Button></div>
          {msg?.ok && <p className="mt-2 text-sm text-green-600">{msg.ok}</p>}
          {msg?.err && <p className="mt-2 text-sm text-red-500">{msg.err}</p>}
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Mis solicitudes</h3>
        <Table head={["Producto", "Precio", "Estado", "Respuesta"]}>
          {lista.map((s) => (
            <tr key={s.id} className="border-b border-sand/60">
              <td className="px-3 py-2 font-medium">{s.nombre}</td>
              <td className="px-3 py-2">${s.precio}</td>
              <td className="px-3 py-2"><Pill tone={TONO[s.estado] || "neutral"}>{s.estado}</Pill></td>
              <td className="px-3 py-2 text-ink/60">{s.respuesta_admin || "—"}</td>
            </tr>
          ))}
          {lista.length === 0 && <tr><td colSpan="4" className="px-3 py-6 text-center text-sm text-ink/40">Sin solicitudes aún.</td></tr>}
        </Table>
      </Card>
    </div>
  );
}
