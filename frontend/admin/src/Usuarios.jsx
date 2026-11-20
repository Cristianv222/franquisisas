import { useEffect, useState } from "react";
import { UserPlus, KeyRound, Copy, Check } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Pill, Modal } from "./ui";

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

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [franquicias, setFranquicias] = useState([]);
  const [form, setForm] = useState({ username: "", email: "", rol: "ADMIN", franquicia_id: "" });
  const [msg, setMsg] = useState("");
  const [cred, setCred] = useState(null);

  async function cargar() {
    const u = await api.get("/auth/usuarios/");
    setUsuarios(u.ok ? await u.json() : []);
    const f = await api.get("/franquicias/franquicias/");
    setFranquicias(f.ok ? await f.json() : []);
  }
  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault(); setMsg("");
    const body = { username: form.username, email: form.email, rol: form.rol };
    if (form.rol === "FRANQUICIA") {
      if (!form.franquicia_id) { setMsg("Selecciona la franquicia."); return; }
      body.franquicia_id = Number(form.franquicia_id);
    }
    const res = await api.post("/auth/usuarios/", body);
    const d = await res.json();
    if (res.ok) {
      setCred({ usuario: d.username, password: d.password_generada, email: form.email });
      setForm({ username: "", email: "", rol: "ADMIN", franquicia_id: "" });
      cargar();
    } else setMsg(JSON.stringify(d));
  }

  async function resetear(u) {
    const res = await api.post(`/auth/usuarios/${u.id}/reset-password/`, {});
    const d = await res.json();
    if (res.ok) setCred({ usuario: d.usuario, password: d.password_generada, email: d.email, reset: true });
  }

  const nombreFranquicia = (id) => franquicias.find((f) => f.id === id)?.nombre || (id ? `#${id}` : "—");

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><UserPlus size={18} className="text-brand" /> Nuevo usuario</h3>
        <p className="mb-4 text-sm text-ink/50">Crea usuarios por rol. Un <b>Administrador</b> accede a este panel; una <b>Franquicia</b> accede a su panel de ventas.</p>
        <form onSubmit={crear}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Usuario" req><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
            <Field label="Correo" req><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
            <Field label="Rol" req><Select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}><option value="ADMIN">Administrador</option><option value="FRANQUICIA">Franquicia</option></Select></Field>
            {form.rol === "FRANQUICIA" && (
              <Field label="Franquicia" req><Select value={form.franquicia_id} onChange={(e) => setForm({ ...form, franquicia_id: e.target.value })}><option value="">—</option>{franquicias.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}</Select></Field>
            )}
          </div>
          <div className="mt-4"><Button type="submit">Crear usuario</Button></div>
          {msg && <p className="mt-2 text-sm text-red-500">{msg}</p>}
          <p className="mt-2 text-xs text-ink/50">La contraseña se genera automáticamente y el usuario deberá cambiarla al ingresar.</p>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Usuarios</h3>
        <Table head={["Usuario", "Correo", "Rol", "Franquicia", ""]}>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b border-sand/60">
              <td className="px-3 py-2 font-medium">{u.username}</td>
              <td className="px-3 py-2 text-ink/60">{u.email || "—"}</td>
              <td className="px-3 py-2"><Pill tone={u.rol === "ADMIN" ? "warn" : "neutral"}>{u.rol === "ADMIN" ? "Administrador" : "Franquicia"}</Pill></td>
              <td className="px-3 py-2 text-ink/60">{u.rol === "FRANQUICIA" ? nombreFranquicia(u.franquicia_id) : "—"}</td>
              <td className="px-3 py-2"><Button variant="outline" onClick={() => resetear(u)}><KeyRound size={14} /> Resetear contraseña</Button></td>
            </tr>
          ))}
          {usuarios.length === 0 && <tr><td colSpan="5" className="px-3 py-6 text-center text-sm text-ink/40">Sin usuarios.</td></tr>}
        </Table>
      </Card>

      <Modal open={!!cred} onClose={() => setCred(null)} title={cred?.reset ? "Contraseña restablecida" : "Usuario creado"} size="md" footer={<Button onClick={() => setCred(null)}>Listo</Button>}>
        {cred && (
          <>
            <p className="mb-4 text-sm text-ink/60">Comparte estas credenciales. Se enviaron por correo (si Resend está configurado). El usuario deberá cambiar la contraseña al ingresar.</p>
            <div className="space-y-2">
              <Copiable label="Usuario" value={cred.usuario} />
              <Copiable label="Contraseña temporal" value={cred.password} />
              {cred.email && <Copiable label="Correo" value={cred.email} />}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
