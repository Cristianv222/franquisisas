import { useEffect, useState } from "react";
import { UserPlus, KeyRound, Copy, Check } from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Pill, Modal } from "./ui";

const SUBROL_LABEL = { ADMIN_FRAN: "Administrador", CAJERO: "Cajero" };

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
  const [form, setForm] = useState({ username: "", email: "", sub_rol: "CAJERO" });
  const [msg, setMsg] = useState("");
  const [cred, setCred] = useState(null);

  async function cargar() {
    const u = await api.get("/auth/usuarios/mi-franquicia/");
    setUsuarios(u.ok ? await u.json() : []);
  }
  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault(); setMsg("");
    const res = await api.post("/auth/usuarios/mi-franquicia/", {
      username: form.username,
      email: form.email,
      sub_rol: form.sub_rol,
    });
    const d = await res.json();
    if (res.ok) {
      setCred({ usuario: d.username, password: d.password_generada, email: form.email });
      setForm({ username: "", email: "", sub_rol: "CAJERO" });
      cargar();
    } else setMsg(d.username?.[0] || d.detail || "No se pudo crear el usuario.");
  }

  async function resetear(u) {
    const res = await api.post(`/auth/usuarios/mi-franquicia/${u.id}/reset-password/`, {});
    const d = await res.json();
    if (res.ok) setCred({ usuario: d.usuario, password: d.password_generada, email: d.email, reset: true });
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><UserPlus size={18} className="text-brand" /> Nuevo usuario de la franquicia</h3>
        <p className="mb-4 text-sm text-ink/50">Un <b>Administrador</b> gestiona todo el panel; un <b>Cajero</b> solo registra ventas y ve reportes para entregar la caja del día.</p>
        <form onSubmit={crear}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="Usuario"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></Field>
            <Field label="Correo"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
            <Field label="Rol"><Select value={form.sub_rol} onChange={(e) => setForm({ ...form, sub_rol: e.target.value })}><option value="CAJERO">Cajero</option><option value="ADMIN_FRAN">Administrador</option></Select></Field>
          </div>
          <div className="mt-4"><Button type="submit"><UserPlus size={16} /> Crear usuario</Button></div>
          {msg && <p className="mt-2 text-sm text-red-500">{msg}</p>}
          <p className="mt-2 text-xs text-ink/50">La contraseña se genera automáticamente y el usuario deberá cambiarla al ingresar.</p>
        </form>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Usuarios de la franquicia</h3>
        <Table head={["Usuario", "Correo", "Rol", ""]}>
          {usuarios.map((u) => (
            <tr key={u.id} className="border-b border-sand/60">
              <td className="px-3 py-2 font-medium">{u.username}</td>
              <td className="px-3 py-2 text-ink/60">{u.email || "—"}</td>
              <td className="px-3 py-2"><Pill tone={u.sub_rol === "ADMIN_FRAN" ? "warn" : "neutral"}>{SUBROL_LABEL[u.sub_rol] || "Cajero"}</Pill></td>
              <td className="px-3 py-2"><Button variant="outline" onClick={() => resetear(u)}><KeyRound size={14} /> Resetear contraseña</Button></td>
            </tr>
          ))}
          {usuarios.length === 0 && <tr><td colSpan="4" className="px-3 py-6 text-center text-sm text-ink/40">Sin usuarios todavía.</td></tr>}
        </Table>
      </Card>

      <Modal open={!!cred} onClose={() => setCred(null)} title={cred?.reset ? "Contraseña restablecida" : "Usuario creado"} size="md" footer={<Button onClick={() => setCred(null)}>Listo</Button>}>
        {cred && (
          <>
            <p className="mb-4 text-sm text-ink/60">Comparte estas credenciales. El usuario deberá cambiar la contraseña al ingresar.</p>
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
