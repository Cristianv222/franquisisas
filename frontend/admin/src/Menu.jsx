import { useEffect, useState } from "react";
import { Plus, UtensilsCrossed, ImagePlus, ClipboardList, Trash2 } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Modal } from "./ui";

export default function Menu() {
  const [menus, setMenus] = useState([]);
  const [items, setItems] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [menu, setMenu] = useState({ nombre: "", descripcion: "" });
  const [prod, setProd] = useState({ nombre: "", precio: "", menu: "", imagen: null });
  const [msg, setMsg] = useState("");
  const [recetaDe, setRecetaDe] = useState(null);
  const [linea, setLinea] = useState({ materia_prima: "", cantidad: "" });
  const [recienCreado, setRecienCreado] = useState(false);

  async function cargar() {
    setMenus(await (await api.get("/franquicias/menus/")).json());
    setItems(await (await api.get("/franquicias/items/")).json());
    setMaterias(await (await api.get("/franquicias/materias-primas/")).json());
    setRecetas(await (await api.get("/franquicias/recetas/")).json());
  }
  useEffect(() => { cargar(); }, []);

  async function crearMenu(e) {
    e.preventDefault();
    await api.post("/franquicias/menus/", menu);
    setMenu({ nombre: "", descripcion: "" });
    cargar();
  }

  async function crearProducto(e) {
    e.preventDefault(); setMsg("");
    const fd = new FormData();
    fd.append("nombre", prod.nombre); fd.append("precio", prod.precio);
    fd.append("estado", "ACTIVO"); fd.append("menu", prod.menu);
    if (prod.imagen) fd.append("imagen", prod.imagen);
    const res = await api.postForm("/franquicias/items/", fd);
    if (!res.ok) { setMsg(JSON.stringify(await res.json())); return; }
    const creado = await res.json();
    setProd({ nombre: "", precio: "", menu: "", imagen: null }); e.target.reset();
    await cargar();
    setRecienCreado(true);
    setRecetaDe(creado); // abre el constructor de receta
  }

  async function agregarLinea() {
    if (!linea.materia_prima || !linea.cantidad) return;
    await api.post("/franquicias/recetas/", { item: recetaDe.id, materia_prima: Number(linea.materia_prima), cantidad: linea.cantidad });
    setLinea({ materia_prima: "", cantidad: "" });
    cargar();
  }
  async function quitarLinea(id) { await api.del(`/franquicias/recetas/${id}/`); cargar(); }

  const lineasReceta = recetaDe ? recetas.filter((r) => r.item === recetaDe.id) : [];
  const unidadSel = materias.find((m) => m.id === Number(linea.materia_prima))?.unidad;
  const recetaCount = (itemId) => recetas.filter((r) => r.item === itemId).length;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><UtensilsCrossed size={18} className="text-brand" /> Menús</h3>
        <p className="mb-4 text-sm text-ink/50">Agrupan los productos que luego asignas a cada franquicia.</p>
        <form onSubmit={crearMenu} className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Nombre del menú"><Input value={menu.nombre} onChange={(e) => setMenu({ ...menu, nombre: e.target.value })} required placeholder="Ej. Menú principal" /></Field>
          <Field label="Descripción"><Input value={menu.descripcion} onChange={(e) => setMenu({ ...menu, descripcion: e.target.value })} /></Field>
          <div className="flex items-end"><Button type="submit"><Plus size={16} /> Crear menú</Button></div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {menus.map((m) => <span key={m.id} className="rounded-full bg-sand/70 px-3 py-1 text-sm">{m.nombre}</span>)}
          {menus.length === 0 && <span className="text-sm text-ink/40">Aún no hay menús.</span>}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><Plus size={18} className="text-brand" /> Nuevo producto</h3>
        <p className="mb-4 text-sm text-ink/50">Crea el producto (nombre, precio e imagen). Al guardarlo, armas su receta completa.</p>
        {menus.length === 0 ? (
          <p className="rounded-lg bg-brand-soft/30 px-4 py-3 text-sm text-ink/70">Primero crea un menú arriba.</p>
        ) : (
          <form onSubmit={crearProducto}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Nombre del producto"><Input value={prod.nombre} onChange={(e) => setProd({ ...prod, nombre: e.target.value })} required placeholder="Ej. Papipollo" /></Field>
              <Field label="Precio ($)"><Input type="number" step="0.01" value={prod.precio} onChange={(e) => setProd({ ...prod, precio: e.target.value })} required placeholder="0.00" /></Field>
              <Field label="Menú"><Select value={prod.menu} onChange={(e) => setProd({ ...prod, menu: e.target.value })} required><option value="">Selecciona…</option>{menus.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</Select></Field>
            </div>
            <div className="mt-4">
              <span className="mb-1 block text-xs font-medium text-ink/60">Imagen del producto (máx 2 MB · JPG/PNG/WebP)</span>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-sand px-4 py-3 text-sm text-ink/60 hover:bg-sand/30">
                <ImagePlus size={18} className="text-brand" />
                {prod.imagen ? prod.imagen.name : "Elegir imagen…"}
                <input type="file" accept="image/*" required className="hidden" onChange={(e) => setProd({ ...prod, imagen: e.target.files[0] })} />
              </label>
            </div>
            <div className="mt-4"><Button type="submit">Crear producto y armar receta</Button></div>
            {msg && <p className="mt-2 text-sm text-red-500">{msg}</p>}
          </form>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Productos</h3>
        <Table head={["", "Producto", "Precio", "Menú", "Receta"]}>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-sand/60">
              <td className="px-3 py-2">{i.imagen ? <img src={i.imagen} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-sand" />}</td>
              <td className="px-3 py-2 font-medium">{i.nombre}</td>
              <td className="px-3 py-2">${i.precio}</td>
              <td className="px-3 py-2 text-ink/60">{menus.find((m) => m.id === i.menu)?.nombre || (i.franquicia_id ? "Exclusivo" : "—")}</td>
              <td className="px-3 py-2">
                <Button variant="outline" onClick={() => { setRecienCreado(false); setRecetaDe(i); }}>
                  <ClipboardList size={14} /> Receta ({recetaCount(i.id)})
                </Button>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="5" className="px-3 py-6 text-center text-sm text-ink/40">Aún no hay productos.</td></tr>}
        </Table>
      </Card>

      {/* Constructor de receta */}
      <Modal
        open={!!recetaDe}
        onClose={() => setRecetaDe(null)}
        title={`Receta de ${recetaDe?.nombre || ""}`}
        size="xl"
        footer={<Button onClick={() => setRecetaDe(null)}>Listo</Button>}
      >
        {recetaDe && (
          <>
            {recienCreado && (
              <div className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
                Producto creado. Ahora arma su receta: agrega todos los insumos que lleva (papas, pollo, salsas…).
              </div>
            )}
            <p className="mb-2 text-sm font-medium">Insumos de la receta</p>
            <div className="space-y-2">
              {lineasReceta.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-sand px-3 py-2 text-sm">
                  <span>{r.materia_prima_nombre} — <b>{r.cantidad}</b> {r.materia_prima_unidad?.toLowerCase()}</span>
                  <button onClick={() => quitarLinea(r.id)} className="text-ink/40 hover:text-red-500" title="Quitar"><Trash2 size={16} /></button>
                </div>
              ))}
              {lineasReceta.length === 0 && <p className="text-sm text-ink/40">Aún no hay insumos en esta receta.</p>}
            </div>

            <div className="mt-4 flex items-end gap-3 rounded-xl bg-sand/30 p-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-ink/60">Insumo</label>
                <Select value={linea.materia_prima} onChange={(e) => setLinea({ ...linea, materia_prima: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad.toLowerCase()})</option>)}
                </Select>
              </div>
              <div className="w-36">
                <label className="mb-1 block text-xs font-medium text-ink/60">Cantidad {unidadSel ? `(${unidadSel.toLowerCase()})` : ""}</label>
                <Input type="number" step="0.001" value={linea.cantidad} onChange={(e) => setLinea({ ...linea, cantidad: e.target.value })} />
              </div>
              <Button onClick={agregarLinea} disabled={!linea.materia_prima || !linea.cantidad}><Plus size={16} /> Agregar</Button>
            </div>
            {materias.length === 0 && <p className="mt-2 text-sm text-ink/40">Primero crea insumos (materia prima) en la sección Insumos.</p>}
          </>
        )}
      </Modal>
    </div>
  );
}
