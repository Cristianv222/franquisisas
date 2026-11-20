import { useEffect, useState } from "react";
import {
  Plus, Store, Upload, Copy, Check, Mail, Phone, MapPin, User, IdCard,
  Pencil, Power, Calendar,
} from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Modal, Pill } from "./ui";

const VACIO = {
  nombre: "", propietario: "", identificacion: "", telefono: "", email: "",
  direccion: "", ciudad: "", usuario: "", estado: "ACTIVA",
};

function LogoDrop({ file, actual, onFile }) {
  const [drag, setDrag] = useState(false);
  const url = file ? URL.createObjectURL(file) : actual;
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => document.getElementById("logo-input").click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${
        drag ? "border-brand bg-brand/5" : "border-sand hover:bg-sand/20"
      }`}
    >
      {url ? <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover" /> : <Upload size={26} className="text-ink/40" />}
      <p className="text-sm text-ink/60">{file ? file.name : "Arrastra tu logo aquí o haz clic para subir"}</p>
    </div>
  );
}

function Copiable({ label, value }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center justify-between rounded-lg border border-sand bg-sand/30 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-ink/50">{label}</div>
        <div className="truncate font-mono text-sm">{value}</div>
      </div>
      <button type="button" onClick={() => { navigator.clipboard.writeText(value); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }} className="ml-3 shrink-0 text-ink/50 hover:text-brand">
        {copiado ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" }) : "—");

export default function Franquicias() {
  const [lista, setLista] = useState([]);
  const [menus, setMenus] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);

  const [modal, setModal] = useState(null); // null | "nueva" | franquicia(obj) para editar
  const [form, setForm] = useState(VACIO);
  const [logo, setLogo] = useState(null);
  const [menusSel, setMenusSel] = useState([]);
  const [msg, setMsg] = useState("");
  const [credenciales, setCredenciales] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [confirmEstado, setConfirmEstado] = useState(null);

  async function cargar() {
    setLista(await (await api.get("/franquicias/franquicias/")).json());
    setMenus(await (await api.get("/franquicias/menus/")).json());
    setAsignaciones(await (await api.get("/franquicias/asignaciones/")).json());
  }
  useEffect(() => { cargar(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleMenu = (id) => setMenusSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const editando = modal && modal !== "nueva";

  function abrirNueva() {
    setForm(VACIO); setLogo(null); setMenusSel([]); setMsg(""); setModal("nueva");
  }
  function abrirEditar(f) {
    setForm({ ...VACIO, ...f, usuario: "" });
    setLogo(null);
    setMenusSel(asignaciones.filter((a) => a.franquicia === f.id).map((a) => a.menu));
    setMsg(""); setDetalle(null); setModal(f);
  }

  async function guardar() {
    setMsg("");
    const fd = new FormData();
    ["nombre", "propietario", "identificacion", "telefono", "email", "direccion", "ciudad", "estado"]
      .forEach((k) => fd.append(k, form[k] || ""));
    if (logo) fd.append("logo", logo);

    if (editando) {
      const rf = await api.patchForm(`/franquicias/franquicias/${modal.id}/`, fd);
      if (!rf.ok) { setMsg(JSON.stringify(await rf.json())); return; }
      const ya = asignaciones.filter((a) => a.franquicia === modal.id).map((a) => a.menu);
      for (const m of menusSel) if (!ya.includes(m)) await api.post("/franquicias/asignaciones/", { franquicia: modal.id, menu: m });
      setModal(null); cargar();
    } else {
      const rf = await api.postForm("/franquicias/franquicias/", fd);
      if (!rf.ok) { setMsg("Franquicia: " + JSON.stringify(await rf.json())); return; }
      const fr = await rf.json();
      const ru = await api.post("/auth/usuarios/franquicia/", { username: form.usuario, email: form.email, franquicia_id: fr.id });
      if (!ru.ok) { setMsg("Usuario: " + JSON.stringify(await ru.json())); cargar(); return; }
      const user = await ru.json();
      for (const m of menusSel) await api.post("/franquicias/asignaciones/", { franquicia: fr.id, menu: m });
      setModal(null);
      setCredenciales({ usuario: user.username, password: user.password_generada, email: form.email });
      cargar();
    }
  }

  async function confirmarEstado() {
    const f = confirmEstado;
    const nuevo = f.estado === "ACTIVA" ? "SUSPENDIDA" : "ACTIVA";
    await api.patch(`/franquicias/franquicias/${f.id}/`, { estado: nuevo });
    setConfirmEstado(null); setDetalle(null); cargar();
  }

  const menusDe = (fid) =>
    asignaciones.filter((a) => a.franquicia === fid).map((a) => menus.find((m) => m.id === a.menu)?.nombre).filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink/50">{lista.length} franquicia(s) registradas</p>
        <Button onClick={abrirNueva}><Plus size={16} /> Nueva franquicia</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lista.map((f) => (
          <button key={f.id} onClick={() => setDetalle(f)} className="group flex flex-col items-center rounded-2xl border border-sand bg-white p-5 text-center shadow-sm transition hover:border-brand hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft/40 text-brand">
              <Store size={22} />
            </div>
            {f.logo ? (
              <img src={f.logo} alt="" className="mt-3 h-16 w-16 rounded-xl border border-sand object-cover" />
            ) : (
              <div className="mt-3 flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-sand text-ink/30">
                <Store size={20} />
              </div>
            )}
            <div className="mt-3 w-full">
              <div className="truncate font-semibold">{f.nombre}</div>
              <div className="truncate text-sm text-ink/50">{f.propietario || "Sin propietario"}</div>
              <div className="mt-2"><Pill tone={f.estado === "ACTIVA" ? "ok" : "bad"}>{f.estado}</Pill></div>
              <div className="mt-2 flex items-center justify-center gap-1 text-xs text-ink/40"><Calendar size={12} /> {fecha(f.creado_en)}</div>
            </div>
          </button>
        ))}
        {lista.length === 0 && (
          <Card className="col-span-full p-10 text-center">
            <Store size={32} className="mx-auto text-ink/30" />
            <p className="mt-3 text-sm text-ink/50">Aún no hay franquicias. Crea la primera con "Nueva franquicia".</p>
          </Card>
        )}
      </div>

      {/* Modal: crear / editar */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={editando ? "Editar franquicia" : "Nueva franquicia"}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button onClick={guardar} disabled={!form.nombre || !form.propietario || !form.identificacion || !form.telefono || !form.email || (!editando && !form.usuario)}>
              {editando ? "Guardar cambios" : "Crear franquicia"}
            </Button>
          </>
        }
      >
        <LogoDrop file={logo} actual={editando ? modal.logo : null} onFile={setLogo} />
        <input id="logo-input" type="file" accept="image/*" className="hidden" onChange={(e) => setLogo(e.target.files[0])} />
        <p className="mt-3 text-xs text-ink/50">Los campos con <span className="text-brand">*</span> son obligatorios.</p>
        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Nombre de la franquicia" req><Input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} /></Field>
          <Field label="Propietario / representante" req><Input value={form.propietario} onChange={(e) => set("propietario", e.target.value)} /></Field>
          <Field label="RUC / Cédula" req><Input value={form.identificacion} onChange={(e) => set("identificacion", e.target.value)} /></Field>
          <Field label="Teléfono" req><Input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} /></Field>
          <Field label="Correo" req><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Dirección"><Input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} /></Field>
          <Field label="Ciudad"><Input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} /></Field>
          <Field label="Estado"><Select value={form.estado} onChange={(e) => set("estado", e.target.value)}><option value="ACTIVA">Activa</option><option value="SUSPENDIDA">Suspendida</option></Select></Field>
        </div>

        {!editando && (
          <div className="mt-5 rounded-xl bg-sand/30 p-4">
            <p className="mb-3 text-sm font-medium">Acceso del franquiciado</p>
            <Field label="Usuario" req><Input value={form.usuario} onChange={(e) => set("usuario", e.target.value)} placeholder="ej. vpmotos_centro" /></Field>
            <p className="mt-2 text-xs text-ink/50">La contraseña se genera automáticamente y se mostrará al crear. El franquiciado deberá cambiarla al ingresar.</p>
          </div>
        )}

        <div className="mt-5">
          <span className="mb-2 block text-xs font-medium text-ink/60">Menús a asociar</span>
          <div className="flex flex-wrap gap-2">
            {menus.map((m) => (
              <button key={m.id} onClick={() => toggleMenu(m.id)} className={`rounded-full border px-3 py-1 text-sm transition ${menusSel.includes(m.id) ? "border-brand bg-brand/10 text-brand" : "border-sand text-ink/70 hover:bg-sand/40"}`}>{m.nombre}</button>
            ))}
            {menus.length === 0 && <span className="text-sm text-ink/40">No hay menús (créalos en la sección Menú).</span>}
          </div>
        </div>
        {msg && <p className="mt-3 text-sm text-red-500">{msg}</p>}
      </Modal>

      {/* Modal: credenciales */}
      <Modal open={!!credenciales} onClose={() => setCredenciales(null)} title="Franquicia creada" size="md" footer={<Button onClick={() => setCredenciales(null)}>Listo</Button>}>
        {credenciales && (
          <>
            <p className="mb-4 text-sm text-ink/60">Guarda estas credenciales. Se enviaron por correo (si Resend está configurado). El franquiciado deberá cambiar la contraseña al ingresar.</p>
            <div className="space-y-2">
              <Copiable label="Usuario" value={credenciales.usuario} />
              <Copiable label="Contraseña temporal" value={credenciales.password} />
              <Copiable label="Correo" value={credenciales.email} />
            </div>
          </>
        )}
      </Modal>

      {/* Modal: detalle */}
      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle?.nombre}
        size="xl"
        footer={
          detalle && (
            <>
              <Button variant="ghost" onClick={() => setDetalle(null)}>Cerrar</Button>
              <Button variant="outline" onClick={() => abrirEditar(detalle)}><Pencil size={15} /> Editar</Button>
              <Button variant={detalle.estado === "ACTIVA" ? "danger" : "primary"} onClick={() => setConfirmEstado(detalle)}>
                <Power size={15} /> {detalle.estado === "ACTIVA" ? "Suspender" : "Reactivar"}
              </Button>
            </>
          )
        }
      >
        {detalle && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {detalle.logo ? <img src={detalle.logo} alt="" className="h-16 w-16 rounded-xl border border-sand object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-soft/40 text-brand"><Store size={26} /></div>}
              <div>
                <div className="text-lg font-semibold">{detalle.nombre}</div>
                <Pill tone={detalle.estado === "ACTIVA" ? "ok" : "bad"}>{detalle.estado}</Pill>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2"><User size={15} className="text-ink/40" /> {detalle.propietario || "—"}</div>
              <div className="flex items-center gap-2"><IdCard size={15} className="text-ink/40" /> RUC / Cédula: {detalle.identificacion || "—"}</div>
              <div className="flex items-center gap-2"><Phone size={15} className="text-ink/40" /> {detalle.telefono || "—"}</div>
              <div className="flex items-center gap-2"><Mail size={15} className="text-ink/40" /> {detalle.email || "—"}</div>
              <div className="flex items-center gap-2"><MapPin size={15} className="text-ink/40" /> {detalle.ciudad || "—"}</div>
              <div className="col-span-full flex items-center gap-2"><MapPin size={15} className="text-ink/40" /> {detalle.direccion || "—"}</div>
              <div className="col-span-full flex items-center gap-2"><Calendar size={15} className="text-ink/40" /> Creada el {fecha(detalle.creado_en)}</div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Menús asignados</p>
              <div className="flex flex-wrap gap-2">
                {menusDe(detalle.id).map((n, i) => <Pill key={i}>{n}</Pill>)}
                {menusDe(detalle.id).length === 0 && <span className="text-sm text-ink/40">Ninguno.</span>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: confirmar cambio de estado */}
      <Modal
        open={!!confirmEstado}
        onClose={() => setConfirmEstado(null)}
        title={confirmEstado?.estado === "ACTIVA" ? "Suspender franquicia" : "Reactivar franquicia"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEstado(null)}>Cancelar</Button>
            <Button variant={confirmEstado?.estado === "ACTIVA" ? "danger" : "primary"} onClick={confirmarEstado}>
              {confirmEstado?.estado === "ACTIVA" ? "Sí, suspender" : "Sí, reactivar"}
            </Button>
          </>
        }
      >
        {confirmEstado && (
          <p className="text-sm text-ink/70">
            {confirmEstado.estado === "ACTIVA" ? (
              <>¿Estás seguro que quieres <b>suspender</b> la franquicia <strong className="text-brand">{confirmEstado.nombre}</strong>? No podrá iniciar sesión ni registrar ventas hasta reactivarla.</>
            ) : (
              <>¿Deseas <b>reactivar</b> la franquicia <strong className="text-brand">{confirmEstado.nombre}</strong>?</>
            )}
          </p>
        )}
      </Modal>
    </div>
  );
}
