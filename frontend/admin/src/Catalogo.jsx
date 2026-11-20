import { useEffect, useState } from "react";
import { Plus, UtensilsCrossed, Carrot, ClipboardList, Link2 } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Pill } from "./ui";

const UNIDADES = ["UNIDAD", "PORCION", "PRESA", "GRAMO", "KILOGRAMO", "MILILITRO", "LITRO"];

export default function Catalogo() {
  const [materias, setMaterias] = useState([]);
  const [menus, setMenus] = useState([]);
  const [items, setItems] = useState([]);
  const [franquicias, setFranquicias] = useState([]);
  const [msg, setMsg] = useState("");

  const [mp, setMp] = useState({ nombre: "", unidad: "UNIDAD" });
  const [menu, setMenu] = useState({ nombre: "", descripcion: "" });
  const [item, setItem] = useState({ nombre: "", precio: "", menu: "", imagen: null });
  const [receta, setReceta] = useState({ item: "", materia_prima: "", cantidad: "" });
  const [asig, setAsig] = useState({ franquicia: "", menu: "" });

  async function cargar() {
    setMaterias(await (await api.get("/franquicias/materias-primas/")).json());
    setMenus(await (await api.get("/franquicias/menus/")).json());
    setItems(await (await api.get("/franquicias/items/")).json());
    setFranquicias(await (await api.get("/franquicias/franquicias/")).json());
  }
  useEffect(() => { cargar(); }, []);

  async function crearMp(e) { e.preventDefault(); await api.post("/franquicias/materias-primas/", mp); setMp({ nombre: "", unidad: "UNIDAD" }); cargar(); }
  async function crearMenu(e) { e.preventDefault(); await api.post("/franquicias/menus/", menu); setMenu({ nombre: "", descripcion: "" }); cargar(); }
  async function crearItem(e) {
    e.preventDefault(); setMsg("");
    const fd = new FormData();
    fd.append("nombre", item.nombre); fd.append("precio", item.precio); fd.append("estado", "ACTIVO");
    if (item.menu) fd.append("menu", item.menu);
    if (item.imagen) fd.append("imagen", item.imagen);
    const res = await api.postForm("/franquicias/items/", fd);
    if (res.ok) { setItem({ nombre: "", precio: "", menu: "", imagen: null }); e.target.reset(); cargar(); }
    else setMsg(JSON.stringify(await res.json()));
  }
  async function crearReceta(e) {
    e.preventDefault();
    await api.post("/franquicias/recetas/", { item: Number(receta.item), materia_prima: Number(receta.materia_prima), cantidad: receta.cantidad });
    setReceta({ item: "", materia_prima: "", cantidad: "" }); cargar();
  }
  async function crearAsig(e) {
    e.preventDefault();
    await api.post("/franquicias/asignaciones/", { franquicia: Number(asig.franquicia), menu: Number(asig.menu) });
    setAsig({ franquicia: "", menu: "" });
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><Carrot size={18} className="text-brand" /> Materia prima</h3>
        <form onSubmit={crearMp} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nombre"><Input value={mp.nombre} onChange={(e) => setMp({ ...mp, nombre: e.target.value })} required /></Field>
          <Field label="Unidad"><Select value={mp.unidad} onChange={(e) => setMp({ ...mp, unidad: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</Select></Field>
          <div className="flex items-end"><Button type="submit"><Plus size={16} /> Agregar</Button></div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{materias.map((m) => <Pill key={m.id}>{m.nombre} · {m.unidad}</Pill>)}</div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><UtensilsCrossed size={18} className="text-brand" /> Menú</h3>
        <form onSubmit={crearMenu} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nombre"><Input value={menu.nombre} onChange={(e) => setMenu({ ...menu, nombre: e.target.value })} required /></Field>
          <Field label="Descripción"><Input value={menu.descripcion} onChange={(e) => setMenu({ ...menu, descripcion: e.target.value })} /></Field>
          <div className="flex items-end"><Button type="submit"><Plus size={16} /> Agregar</Button></div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{menus.map((m) => <Pill key={m.id}>{m.nombre}</Pill>)}</div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><Plus size={18} className="text-brand" /> Item del menú</h3>
        <form onSubmit={crearItem}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Nombre"><Input value={item.nombre} onChange={(e) => setItem({ ...item, nombre: e.target.value })} required /></Field>
            <Field label="Precio"><Input type="number" step="0.01" value={item.precio} onChange={(e) => setItem({ ...item, precio: e.target.value })} required /></Field>
            <Field label="Menú"><Select value={item.menu} onChange={(e) => setItem({ ...item, menu: e.target.value })} required><option value="">—</option>{menus.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</Select></Field>
          </div>
          <div className="mt-3">
            <Field label="Imagen (máx 2 MB · JPG/PNG/WebP)">
              <input type="file" accept="image/*" onChange={(e) => setItem({ ...item, imagen: e.target.files[0] })} required className="text-sm text-ink/70" />
            </Field>
          </div>
          <div className="mt-4"><Button type="submit">Crear item</Button></div>
          {msg && <p className="mt-2 text-sm text-red-500">{msg}</p>}
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><ClipboardList size={18} className="text-brand" /> Receta (materia prima por item)</h3>
        <form onSubmit={crearReceta} className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field label="Item"><Select value={receta.item} onChange={(e) => setReceta({ ...receta, item: e.target.value })} required><option value="">—</option>{items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</Select></Field>
          <Field label="Materia prima"><Select value={receta.materia_prima} onChange={(e) => setReceta({ ...receta, materia_prima: e.target.value })} required><option value="">—</option>{materias.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</Select></Field>
          <Field label="Cantidad"><Input type="number" step="0.001" value={receta.cantidad} onChange={(e) => setReceta({ ...receta, cantidad: e.target.value })} required /></Field>
          <div className="flex items-end"><Button type="submit"><Plus size={16} /> Agregar</Button></div>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Items</h3>
        <Table head={["Nombre", "Precio", "Menú", "Exclusivo de"]}>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-sand/60">
              <td className="px-3 py-2">{i.nombre}</td>
              <td className="px-3 py-2">${i.precio}</td>
              <td className="px-3 py-2 text-ink/60">{i.menu || "—"}</td>
              <td className="px-3 py-2 text-ink/60">{i.franquicia_id || "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold"><Link2 size={18} className="text-brand" /> Asignar menú a franquicia</h3>
        <form onSubmit={crearAsig} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Franquicia"><Select value={asig.franquicia} onChange={(e) => setAsig({ ...asig, franquicia: e.target.value })} required><option value="">—</option>{franquicias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</Select></Field>
          <Field label="Menú"><Select value={asig.menu} onChange={(e) => setAsig({ ...asig, menu: e.target.value })} required><option value="">—</option>{menus.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</Select></Field>
          <div className="flex items-end"><Button type="submit">Asignar</Button></div>
        </form>
      </Card>
    </div>
  );
}
