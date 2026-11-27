import { useEffect, useState } from "react";
import { Plus, UtensilsCrossed, ImagePlus, ClipboardList, Trash2, Pencil, Power } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Modal, Pill } from "./ui";

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
  const [editMenu, setEditMenu] = useState(null);   // { id, nombre, descripcion, estado }
  const [editProd, setEditProd] = useState(null);   // { id, nombre, precio, menu, estado, imagen }
  const [borrar, setBorrar] = useState(null);       // { tipo: "menu" | "item", obj }
  const [errModal, setErrModal] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Muestra el mensaje del servidor (detail) o, si no hay, los errores de campo.
  async function textoError(res) {
    try {
      const d = await res.json();
      if (d.detail) return d.detail;
      return Object.entries(d).map(([k, v]) => `${k}: ${[].concat(v).join(" ")}`).join(" · ");
    } catch { return "No se pudo completar la operación."; }
  }

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

  async function guardarMenu() {
    setGuardando(true); setErrModal("");
    const res = await api.patch(`/franquicias/menus/${editMenu.id}/`, {
      nombre: editMenu.nombre, descripcion: editMenu.descripcion, estado: editMenu.estado,
    });
    setGuardando(false);
    if (!res.ok) { setErrModal(await textoError(res)); return; }
    setEditMenu(null); cargar();
  }

  async function guardarProducto() {
    setGuardando(true); setErrModal("");
    const fd = new FormData();
    fd.append("nombre", editProd.nombre); fd.append("precio", editProd.precio);
    fd.append("estado", editProd.estado);
    if (editProd.menu) fd.append("menu", editProd.menu);
    if (editProd.imagen) fd.append("imagen", editProd.imagen);   // solo si eligió una nueva
    const res = await api.patchForm(`/franquicias/items/${editProd.id}/`, fd);
    setGuardando(false);
    if (!res.ok) { setErrModal(await textoError(res)); return; }
    setEditProd(null); cargar();
  }

  async function confirmarBorrado() {
    setGuardando(true); setErrModal("");
    const ruta = borrar.tipo === "menu" ? "menus" : "items";
    const res = await api.del(`/franquicias/${ruta}/${borrar.obj.id}/`);
    setGuardando(false);
    if (!res.ok) { setErrModal(await textoError(res)); return; }
    setBorrar(null); cargar();
  }

  // Alternativa a borrar un producto que ya tiene ventas: dejarlo inactivo (no sale en el POS).
  async function desactivarProducto() {
    setGuardando(true);
    const res = await api.patch(`/franquicias/items/${borrar.obj.id}/`, { estado: "INACTIVO" });
    setGuardando(false);
    if (!res.ok) { setErrModal(await textoError(res)); return; }
    setBorrar(null); cargar();
  }

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
        <div className="mt-4 divide-y divide-sand/60 rounded-xl border border-sand/60">
          {menus.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{m.nombre}</span>
                {m.estado === "INACTIVO" && <span className="ml-2"><Pill tone="warn">Inactivo</Pill></span>}
                <span className="ml-2 text-ink/40">{items.filter((i) => i.menu === m.id).length} productos</span>
                {m.descripcion && <p className="truncate text-xs text-ink/50">{m.descripcion}</p>}
              </div>
              <button title="Editar menú" onClick={() => { setErrModal(""); setEditMenu({ ...m }); }}
                className="rounded-lg p-2 text-ink/50 hover:bg-sand/60 hover:text-ink"><Pencil size={16} /></button>
              <button title="Eliminar menú" onClick={() => { setErrModal(""); setBorrar({ tipo: "menu", obj: m }); }}
                className="rounded-lg p-2 text-ink/50 hover:bg-red-50 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
          ))}
          {menus.length === 0 && <div className="px-4 py-3 text-sm text-ink/40">Aún no hay menús.</div>}
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
        <Table head={["", "Producto", "Precio", "Menú", "Estado", "Acciones"]}>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-sand/60">
              <td className="px-3 py-2">{i.imagen ? <img src={i.imagen} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-sand" />}</td>
              <td className="px-3 py-2 font-medium">{i.nombre}</td>
              <td className="px-3 py-2">${i.precio}</td>
              <td className="px-3 py-2 text-ink/60">{menus.find((m) => m.id === i.menu)?.nombre || (i.franquicia_id ? "Exclusivo" : "—")}</td>
              <td className="px-3 py-2">{i.estado === "ACTIVO" ? <Pill tone="ok">Activo</Pill> : <Pill tone="warn">Inactivo</Pill>}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => { setRecienCreado(false); setRecetaDe(i); }}>
                    <ClipboardList size={14} /> Receta ({recetaCount(i.id)})
                  </Button>
                  <Button variant="outline" onClick={() => { setErrModal(""); setEditProd({ id: i.id, nombre: i.nombre, precio: i.precio, menu: i.menu || "", estado: i.estado, imagen: null, actual: i.imagen, exclusivo: !!i.franquicia_id && !i.menu }); }}>
                    <Pencil size={14} /> Editar
                  </Button>
                  <button title="Eliminar producto" onClick={() => { setErrModal(""); setBorrar({ tipo: "item", obj: i }); }}
                    className="rounded-lg p-2 text-ink/50 hover:bg-red-50 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="6" className="px-3 py-6 text-center text-sm text-ink/40">Aún no hay productos.</td></tr>}
        </Table>
      </Card>

      {/* Editar menú */}
      <Modal open={!!editMenu} onClose={() => setEditMenu(null)} title="Editar menú" size="md"
        footer={<><Button variant="ghost" onClick={() => setEditMenu(null)}>Cancelar</Button>
          <Button onClick={guardarMenu} disabled={guardando || !editMenu?.nombre?.trim()}>Guardar cambios</Button></>}>
        {editMenu && (
          <div className="space-y-3">
            <Field label="Nombre del menú" req><Input value={editMenu.nombre} onChange={(e) => setEditMenu({ ...editMenu, nombre: e.target.value })} /></Field>
            <Field label="Descripción"><Input value={editMenu.descripcion || ""} onChange={(e) => setEditMenu({ ...editMenu, descripcion: e.target.value })} /></Field>
            <Field label="Estado"><Select value={editMenu.estado} onChange={(e) => setEditMenu({ ...editMenu, estado: e.target.value })}>
              <option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option></Select></Field>
            {errModal && <p className="text-sm text-red-500">{errModal}</p>}
          </div>
        )}
      </Modal>

      {/* Editar producto */}
      <Modal open={!!editProd} onClose={() => setEditProd(null)} title="Editar producto" size="md"
        footer={<><Button variant="ghost" onClick={() => setEditProd(null)}>Cancelar</Button>
          <Button onClick={guardarProducto} disabled={guardando || !editProd?.nombre?.trim() || editProd?.precio === ""}>Guardar cambios</Button></>}>
        {editProd && (
          <div className="space-y-3">
            <Field label="Nombre del producto" req><Input value={editProd.nombre} onChange={(e) => setEditProd({ ...editProd, nombre: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio ($)" req><Input type="number" step="0.01" min="0" value={editProd.precio} onChange={(e) => setEditProd({ ...editProd, precio: e.target.value })} /></Field>
              <Field label="Estado"><Select value={editProd.estado} onChange={(e) => setEditProd({ ...editProd, estado: e.target.value })}>
                <option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo (oculto en el POS)</option></Select></Field>
            </div>
            {editProd.exclusivo ? (
              <p className="rounded-lg bg-sand/40 px-3 py-2 text-xs text-ink/60">Este producto es exclusivo de una franquicia, por eso no pertenece a un menú.</p>
            ) : (
              <Field label="Menú"><Select value={editProd.menu} onChange={(e) => setEditProd({ ...editProd, menu: e.target.value })}>
                {menus.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</Select></Field>
            )}
            <div>
              <span className="mb-1 block text-xs font-medium text-ink/60">Imagen (déjala como está si no quieres cambiarla)</span>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-sand px-4 py-3 text-sm text-ink/60 hover:bg-sand/30">
                {editProd.actual && !editProd.imagen ? <img src={editProd.actual} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <ImagePlus size={18} className="text-brand" />}
                {editProd.imagen ? editProd.imagen.name : "Cambiar imagen…"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setEditProd({ ...editProd, imagen: e.target.files[0] || null })} />
              </label>
            </div>
            {errModal && <p className="text-sm text-red-500">{errModal}</p>}
          </div>
        )}
      </Modal>

      {/* Confirmar eliminación */}
      <Modal open={!!borrar} onClose={() => setBorrar(null)} size="md"
        title={borrar?.tipo === "menu" ? "Eliminar menú" : "Eliminar producto"}
        footer={<><Button variant="ghost" onClick={() => setBorrar(null)}>Cancelar</Button>
          {borrar?.tipo === "item" && errModal && borrar.obj.estado === "ACTIVO" &&
            <Button variant="outline" onClick={desactivarProducto} disabled={guardando}><Power size={15} /> Desactivar en su lugar</Button>}
          {!errModal && <Button variant="danger" onClick={confirmarBorrado} disabled={guardando}>Sí, eliminar</Button>}</>}>
        {borrar && (
          <div className="space-y-3 text-sm">
            <p>¿Seguro que quieres eliminar {borrar.tipo === "menu" ? "el menú" : "el producto"} <strong className="text-brand">{borrar.obj.nombre}</strong>? Esta acción no se puede deshacer.</p>
            {errModal && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-600">{errModal}</p>}
          </div>
        )}
      </Modal>

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
