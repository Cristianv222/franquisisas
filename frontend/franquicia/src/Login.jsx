import { useState } from "react";
import { ArrowRight, User, Lock, Eye, EyeOff } from "lucide-react";
import { setTokens, claims } from "./auth";
import logoColor from "./assets/logo-color.png";
import logoWhite from "./assets/logo-full.png";
import foto from "./assets/pos.webp";

export default function Login() {
  const [usuario, setUsuario] = useState(localStorage.getItem("recordar_usuario") || "");
  const [password, setPassword] = useState("");
  const [verPass, setVerPass] = useState(false);
  const [recordar, setRecordar] = useState(!!localStorage.getItem("recordar_usuario"));
  const [err, setErr] = useState("");
  const [cargando, setCargando] = useState(false);
  const [olvido, setOlvido] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setCargando(true);
    const res = await fetch("/api/auth/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usuario, password }),
    });
    setCargando(false);
    if (!res.ok) { setErr("Usuario o contraseña incorrectos."); return; }
    if (recordar) localStorage.setItem("recordar_usuario", usuario);
    else localStorage.removeItem("recordar_usuario");
    const d = await res.json();
    setTokens(d.access, d.refresh);
    if (claims()?.role === "ADMIN") window.location.replace("/admin/");
    else window.location.replace("/");
  }

  const input = "w-full rounded-lg border border-sand bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20";

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-soft/50 via-sand/40 to-brand/20 p-4 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-sand/70 bg-white shadow-2xl md:grid-cols-2">
        {/* Panel de marca con foto del POS */}
        <div
          className="relative hidden flex-col justify-between overflow-hidden p-10 text-white md:flex"
          style={{ backgroundImage: `url(${foto})`, backgroundSize: "cover", backgroundPosition: "center" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-ink/90 via-ink/65 to-brand/45" />
          <img src={logoWhite} alt="FRANQOR" className="relative h-14 w-auto self-start object-contain drop-shadow" />
          <p className="relative max-w-md text-xl font-medium leading-relaxed drop-shadow">
            <span className="font-bold text-brand-soft">Descubre</span> cómo FRANQOR te ayuda a gestionar
            tus franquicias: menús, inventario y ventas en el punto de venta, todo en un solo lugar.
          </p>
          <div className="relative text-xs text-white/75">
            © {new Date().getFullYear()} FRANQOR · Desarrollado por{" "}
            <span className="font-semibold text-brand-soft">FronteraTech</span>
          </div>
        </div>

        {/* Panel del formulario */}
        <div className="flex items-center justify-center p-8 sm:p-10">
          <form onSubmit={submit} className="w-full max-w-sm">
            <div className="mb-8 flex justify-center md:hidden"><img src={logoColor} alt="FRANQOR" className="h-12" /></div>
            <h1 className="text-3xl font-bold text-brand">Iniciar sesión</h1>
            <div className="mb-7 mt-2 h-1 w-12 rounded-full bg-brand" />

            <label className="mb-1 block text-sm font-medium">Usuario o correo</label>
            <div className="relative mb-4">
              <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus className={input} placeholder="usuario o correo@ejemplo.com" />
            </div>

            <label className="mb-1 block text-sm font-medium">Contraseña</label>
            <div className="relative mb-3">
              <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input type={verPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-10`} placeholder="••••••••" />
              <button type="button" onClick={() => setVerPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-brand" title={verPass ? "Ocultar" : "Mostrar"}>
                {verPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            <div className="mb-5 flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-ink/60">
                <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="h-4 w-4 rounded border-sand accent-[var(--color-brand)]" />
                Recordarme
              </label>
              <button type="button" onClick={() => setOlvido((o) => !o)} className="text-brand hover:underline">¿Olvidaste tu contraseña?</button>
            </div>
            {olvido && <p className="mb-4 rounded-lg bg-brand-soft/30 px-3 py-2 text-xs text-ink/70">Pídele al administrador que restablezca tu contraseña desde el panel.</p>}
            {err && <p className="mb-3 text-sm text-red-500">{err}</p>}

            <button type="submit" disabled={cargando} className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-brand/90 disabled:opacity-60">
              {cargando ? "Ingresando…" : "Entrar"} <ArrowRight size={16} />
            </button>

            <p className="mt-8 text-center text-xs text-ink/40 md:hidden">
              Desarrollado por <span className="font-semibold text-brand">FronteraTech</span>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
