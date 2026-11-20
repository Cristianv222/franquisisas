import { useEffect, useState } from "react";
import { Plus, Warehouse, PackagePlus, Boxes, DollarSign } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Modal } from "./ui";

const UNIDADES = ["UNIDAD", "PORCION", "PRESA", "GRAMO", "KILOGRAMO", "MILILITRO", "LITRO"];
const low = (u) => (u ? u.toLowerCase() : "");
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function BodegaGeneral() {
  const [materias, setMaterias] = useState([]);
  const [mp, setMp] = useState({ nombre: "", unidad: "UNIDAD", precio: "" });
  const [compra, setCompra] = useState(null); // insumo en el que se registra la compra
  const [compraForm, setCompraForm] = useState({ cantidad: "", precio: "" });
  const [msg, setMsg] = useState("");

  async function cargar() {
    setMaterias(await (await api.get("/franquicias/materias-primas/")).json());
  }
  useEffect(() => { cargar(); }, []);

  async function crearMp(e) {
    e.preventDefault();
    await api.post("/franquicias/materias-primas/", {
      nombre: mp.nombre,
      unidad: mp.unidad,
      precio: mp.precio || 0,
    });
    setMp({ nombre: "", unidad: "UNIDAD", precio: "" });
    cargar();
  }

  function abrirCompra(m) {
    setCompra(m);
    setCompraForm({ cantidad: "", precio: m.precio && Number(m.precio) > 0 ? m.precio : "" });
    setMsg("");
  }

  async function registrarCompra(e) {
    e.preventDefault(); setMsg("");
    const res = await api.post(`/franquicias/materias-primas/${compra.id}/compra/`, {
      cantidad: compraForm.cantidad,
      precio: compraForm.precio || undefined,
    });
    if (res.ok) { setCompra(null); cargar(); }
    else setMsg((await res.json()).detail || "No se pudo registrar la compra.");
  }

  const valorTotal = materias.reduce((a, m) => a + Number(m.valor || 0), 0);

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-5">
          <div className="rounded-xl bg-brand/10 p-3 text-brand"><Boxes size={22} /></div>
          <div><div className="text-2xl font-bold">{materias.length}</div><div className="text-sm text-ink/50">Insumos</div></div>
        </Card>
        <Card className="flex items-center gap-3 p-5">
          <div className="rounded-xl bg-brand/10 p-3 text-brand"><DollarSign size={22} /></div>
          <div><div className="text-2xl font-bold">{money(valorTotal)}</div><div className="text-sm text-ink/50">Valor de la bodega</div></div>
        </Card>
        <Card className="flex items-center gap-3 p-5">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-600"><PackagePlus size={22} /></div>
          <div><div className="text-2xl font-bold">{materias.filter((m) => Number(m.stock_central) <= 0).length}</div><div className="text-sm text-ink/50">Insumos sin stock</div></div>
        </Card>
      </div>

      {/* Alta de insumo */}
      <Card className="p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><Warehouse size={18} className="text-brand" /> Bodega general</h3>
        <p className="mb-4 text-sm text-ink/50">El almacén central de FRANQOR. Registra aquí tus insumos con su costo, compra stock al proveedor y luego transfiérelo a cada franquicia desde la sección <b>Inventario</b>.</p>
        <form onSubmit={crearMp} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Nombre" req><Input value={mp.nombre} onChange={(e) => setMp({ ...mp, nombre: e.target.value })} required placeholder="Ej. Pollo" /></Field>
          <Field label="Unidad de medida" req><Select value={mp.unidad} onChange={(e) => setMp({ ...mp, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u} value={u}>{u.charAt(0) + u.slice(1).toLowerCase()}</option>)}</Select></Field>
          <Field label="Costo unitario"><Input type="number" step="0.01" min="0" value={mp.precio} onChange={(e) => setMp({ ...mp, precio: e.target.value })} placeholder="0.00" /></Field>
          <div className="flex items-end"><Button type="submit"><Plus size={16} /> Agregar insumo</Button></div>
        </form>
      </Card>

      {/* Tabla de insumos */}
      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Insumos en bodega</h3>
        <Table head={["Insumo", "Unidad", "Costo", "Stock central", "Valor", ""]}>
          {materias.map((m) => (
            <tr key={m.id} className="border-b border-sand/60">
              <td className="px-3 py-2.5 font-medium">{m.nombre}</td>
              <td className="px-3 py-2.5 text-ink/60">{m.unidad.charAt(0) + m.unidad.slice(1).toLowerCase()}</td>
              <td className="px-3 py-2.5">{money(m.precio)}</td>
              <td className="px-3 py-2.5">
                <b className={Number(m.stock_central) <= 0 ? "text-red-500" : ""}>{Number(m.stock_central)}</b> <span className="text-ink/50">{low(m.unidad)}</span>
              </td>
              <td className="px-3 py-2.5 text-ink/70">{money(m.valor)}</td>
              <td className="px-3 py-2.5 text-right">
                <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => abrirCompra(m)}><PackagePlus size={14} /> Comprar</Button>
              </td>
            </tr>
          ))}
          {materias.length === 0 && <tr><td colSpan="6" className="px-3 py-6 text-center text-sm text-ink/40">Aún no hay insumos.</td></tr>}
        </Table>
      </Card>

      {/* Modal de compra */}
      <Modal
        open={!!compra}
        onClose={() => setCompra(null)}
        title={`Comprar ${compra?.nombre || ""}`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCompra(null)}>Cancelar</Button>
            <Button onClick={registrarCompra}><PackagePlus size={16} /> Registrar compra</Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink/60">
          Suma stock a la bodega general. Stock actual: <b>{Number(compra?.stock_central || 0)} {low(compra?.unidad)}</b>.
        </p>
        <form onSubmit={registrarCompra} className="space-y-3">
          <Field label={`Cantidad a comprar (${low(compra?.unidad)})`} req>
            <Input type="number" step="0.001" min="0.001" value={compraForm.cantidad} onChange={(e) => setCompraForm({ ...compraForm, cantidad: e.target.value })} required autoFocus />
          </Field>
          <Field label="Costo unitario (opcional, actualiza el costo)">
            <Input type="number" step="0.01" min="0" value={compraForm.precio} onChange={(e) => setCompraForm({ ...compraForm, precio: e.target.value })} placeholder={money(compra?.precio)} />
          </Field>
          {msg && <p className="text-sm text-red-500">{msg}</p>}
        </form>
      </Modal>
    </div>
  );
}
