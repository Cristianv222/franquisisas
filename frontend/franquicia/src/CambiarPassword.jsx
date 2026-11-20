import { useState } from "react";
import { KeyRound, CheckCircle2 } from "lucide-react";
import { api } from "./api";
import { logout } from "./auth";

export default function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (nueva.length < 8) { setErr("La nueva contraseña debe tener al menos 8 caracteres."); return; }
    if (nueva !== conf) { setErr("Las contraseñas no coinciden."); return; }
    const res = await api.post("/auth/cambiar-password/", { password_actual: actual, password_nueva: nueva });
    if (res.ok) {
      setOk(true);
      setTimeout(() => { logout(); window.location.replace("/"); }, 1800);
    } else {
      const d = await res.json();
      setErr(d.detail || "No se pudo cambiar la contraseña.");
    }
  }

  const input = "w-full rounded-lg border border-sand px-3 py-2 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";
  const label = "mb-1 mt-3 block text-xs font-medium text-ink/60";

  if (ok) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="animate-pop w-full max-w-sm rounded-2xl border border-sand/70 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 size={48} className="mx-auto text-green-500" />
          <h3 className="mt-4 text-lg font-bold">¡Contraseña actualizada!</h3>
          <p className="mt-1 text-sm text-ink/50">Vuelve a iniciar sesión…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form onSubmit={submit} className="animate-fade-up w-full max-w-sm rounded-2xl border border-sand/70 bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white"><KeyRound size={22} /></div>
          <div>
            <div className="text-lg font-bold">Cambia tu contraseña</div>
            <div className="text-sm text-ink/50">Es tu primer ingreso</div>
          </div>
        </div>
        <label className={label}>Contraseña temporal</label>
        <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus className={input} />
        <label className={label}>Nueva contraseña</label>
        <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={input} />
        <label className={label}>Repite la nueva contraseña</label>
        <input type="password" value={conf} onChange={(e) => setConf(e.target.value)} className={input} />
        {err && <p className="mt-3 text-sm text-red-500">{err}</p>}
        <button type="submit" className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-medium text-white transition hover:bg-brand/90">Cambiar contraseña</button>
      </form>
    </div>
  );
}
