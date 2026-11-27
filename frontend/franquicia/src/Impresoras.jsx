import { useEffect, useState } from "react";
import {
  Printer, Plus, Pencil, Trash2, Play, Wallet, KeyRound, Copy, Check, RefreshCw, Ban,
} from "lucide-react";
import { api } from "./api";
import { Card, Button, Field, Input, Select, Table, Pill, Modal } from "./ui";

// Prefijo de la API de impresión (nginx lo enruta al servicio franquicias).
const P = "/franquicias/printer";

// Preset de la impresora estándar: 3nStar RPT004 (térmica de 80 mm).
// El ticket ya queda calibrado, el usuario solo pone el nombre y la conexión.
const PRESET = {
  printer_type: "thermal",
  role: "both", // la comanda y el ticket salen por la misma impresora
  paper_width: 80,
  characters_per_line: 42,
  has_cash_drawer: true,
  cash_drawer_pin: 0,
  cash_drawer_on_time: 100,
  cash_drawer_off_time: 100,
};
const FORM_VACIO = { name: "", connection_type: "usb", host: "", port: 9100, has_cash_drawer: true, is_active: true };

function Copiable({ label, value }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center justify-between rounded-lg border border-sand bg-sand/30 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-ink/50">{label}</div>
        <div className="break-all font-mono text-sm">{value}</div>
      </div>
      <button
        type="button"
        title="Copiar"
        onClick={() => { navigator.clipboard.writeText(value); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}
        className="ml-3 shrink-0 text-ink/50 hover:text-brand"
      >
        {copiado ? <Check size={16} /> : <Copy size={16} />}
      </button>
    </div>
  );
}

// El agente consulta cada pocos segundos: si habló hace menos de 2 min, está conectado.
function agenteConectado(a) {
  return a?.ultima_conexion && Date.now() - new Date(a.ultima_conexion).getTime() < 120000;
}

// Código de instalación: URL + token en una sola cadena, para que quien instala
// el agente (que no es técnico) pegue UNA cosa. Formato FQ1-<base64url(JSON)>.
function codigoInstalacion(url, token) {
  const json = JSON.stringify({ u: url, t: token });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "FQ1-" + b64;
}

// El usuario puede escribir solo el dominio ("https://midominio.com"): se completa la ruta de la API.
function normalizarUrlServidor(u) {
  let x = (u || "").trim().replace(/\/+$/, "");
  if (x && !/^https?:\/\//i.test(x)) x = (/^(\d{1,3}\.){3}\d{1,3}|^localhost/i.test(x) ? "http://" : "https://") + x;
  if (x && /^https?:\/\/[^/]+$/i.test(x)) x += "/api/franquicias/printer"; // solo el dominio → completar la ruta
  return x;
}
const esLocal = (u) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(u);

async function errorDe(res, defecto) {
  try {
    const d = await res.json();
    const primero = Object.values(d)[0];
    return d.detail || d.error || d.message || (Array.isArray(primero) ? primero[0] : primero) || defecto;
  } catch {
    return defecto;
  }
}

// ============================================================================
//  Impresoras
// ============================================================================
function SeccionImpresoras() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(null); // null | { id?: number, form }
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "bad", texto }
  const [probando, setProbando] = useState(null); // `${id}:${accion}`
  const [aBorrar, setABorrar] = useState(null);

  async function cargar() {
    const r = await api.get(`${P}/printers/`);
    setLista(r.ok ? await r.json() : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  function abrirNueva() {
    setError("");
    setModal({ form: { ...FORM_VACIO } });
  }

  function abrirEditar(p) {
    setError("");
    const red = p.connection_type === "network";
    setModal({
      id: p.id,
      form: {
        name: p.name,
        connection_type: red ? "network" : "usb",
        host: red ? p.connection_string : "",
        port: p.port || 9100,
        has_cash_drawer: p.has_cash_drawer,
        is_active: p.is_active,
      },
    });
  }

  const setF = (campos) => setModal((m) => ({ ...m, form: { ...m.form, ...campos } }));

  async function guardar(e) {
    e.preventDefault();
    setError("");
    const f = modal.form;
    const nombre = f.name.trim();
    const red = f.connection_type === "network";
    if (!nombre) return setError("Escribe el nombre de la impresora.");
    if (red && !f.host.trim()) return setError("Escribe la IP de la impresora.");

    const body = {
      ...PRESET,
      name: nombre,
      connection_type: f.connection_type,
      // USB: el agente la ubica por el nombre de Windows. Red: IP + puerto.
      connection_string: red ? f.host.trim() : nombre,
      port: red ? Number(f.port) || 9100 : null,
      has_cash_drawer: f.has_cash_drawer,
      is_active: f.is_active,
    };
    // La primera impresora queda como predeterminada; al editar no se toca.
    if (!modal.id && lista.length === 0) body.is_default = true;
    setGuardando(true);
    const res = modal.id
      ? await api.patch(`${P}/printers/${modal.id}/`, body)
      : await api.post(`${P}/printers/`, body);
    setGuardando(false);
    if (res.ok) {
      setModal(null);
      setAviso({ tipo: "ok", texto: modal.id ? "Impresora actualizada." : "Impresora guardada. Ahora genera el token del agente más abajo." });
      cargar();
    } else {
      setError(await errorDe(res, "No se pudo guardar la impresora."));
    }
  }

  async function probar(p, accion) {
    setAviso(null);
    setProbando(`${p.id}:${accion}`);
    const res = await api.post(`${P}/printers/${p.id}/${accion === "caja" ? "test_cash_drawer" : "test_print"}/`, {});
    setProbando(null);
    if (res.ok) {
      const d = await res.json();
      setAviso({
        tipo: "ok",
        texto: `${d.message || "Enviado."} Si el agente está conectado, saldrá en segundos en «${p.name}».`,
      });
    } else {
      setAviso({ tipo: "bad", texto: await errorDe(res, "No se pudo enviar la prueba.") });
    }
  }

  async function borrar() {
    const p = aBorrar;
    const res = await api.del(`${P}/printers/${p.id}/`);
    setABorrar(null);
    if (res.ok || res.status === 204) {
      setAviso({ tipo: "ok", texto: "Impresora eliminada." });
      cargar();
    } else {
      // PROTECT: si ya tiene trabajos de impresión, no se puede borrar; se desactiva.
      setAviso({ tipo: "bad", texto: "No se puede eliminar porque ya tiene tickets impresos. Edítala y desactívala." });
    }
  }

  const f = modal?.form;
  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold"><Printer size={18} className="text-brand" /> Impresoras</h3>
          <p className="text-sm text-ink/50">
            La comanda de cocina y el ticket de venta salen juntos por esta impresora al cobrar.
          </p>
        </div>
        <Button onClick={abrirNueva}><Plus size={16} /> Agregar impresora</Button>
      </div>

      {aviso && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${aviso.tipo === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
          {aviso.texto}
        </p>
      )}

      <Table head={["Nombre", "Conexión", "Papel", "Caja", "Estado", ""]}>
        {lista.map((p) => (
          <tr key={p.id} className="border-b border-sand/60">
            <td className="px-3 py-2 font-medium">{p.name}</td>
            <td className="px-3 py-2 text-ink/60">
              {p.connection_type === "network" ? `Red · ${p.connection_string}:${p.port}` : "USB"}
            </td>
            <td className="px-3 py-2 text-ink/60">{p.paper_width} mm</td>
            <td className="px-3 py-2 text-ink/60">{p.has_cash_drawer ? "Sí" : "No"}</td>
            <td className="px-3 py-2"><Pill tone={p.is_active ? "ok" : "neutral"}>{p.is_active ? "Activa" : "Inactiva"}</Pill></td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={!p.is_active || !!probando} onClick={() => probar(p, "ticket")}>
                  <Play size={14} /> {probando === `${p.id}:ticket` ? "Enviando…" : "Probar impresora"}
                </Button>
                {p.has_cash_drawer && (
                  <Button variant="outline" disabled={!p.is_active || !!probando} onClick={() => probar(p, "caja")} title="Abrir la caja registradora">
                    <Wallet size={14} /> Probar caja
                  </Button>
                )}
                <Button variant="ghost" onClick={() => abrirEditar(p)} title="Editar"><Pencil size={14} /></Button>
                <Button variant="ghost" onClick={() => setABorrar(p)} title="Eliminar"><Trash2 size={14} /></Button>
              </div>
            </td>
          </tr>
        ))}
        {!cargando && lista.length === 0 && (
          <tr><td colSpan="6" className="px-3 py-8 text-center text-sm text-ink/40">Aún no tienes impresoras. Pulsa «Agregar impresora».</td></tr>
        )}
      </Table>

      {/* Alta / edición */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.id ? "Editar impresora" : "Agregar impresora"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar impresora"}</Button>
          </>
        }
      >
        {f && (
          <form onSubmit={guardar} className="space-y-4">
            <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-ink/70">
              Configurada para <b>3nStar RPT004</b> (térmica, papel de <b>80 mm</b>, {PRESET.characters_per_line} caracteres por línea).
              El formato del ticket ya viene listo.
            </div>

            <Field label="Nombre de la impresora">
              <Input
                value={f.name}
                onChange={(e) => setF({ name: e.target.value })}
                placeholder="3nStar RPT004"
                autoFocus
                required
              />
            </Field>
            <p className="-mt-2 text-xs text-ink/50">
              Debe ser <b>exactamente</b> el nombre con el que aparece instalada en Windows
              (Configuración → Impresoras y escáneres). El agente la busca por ese nombre.
            </p>

            <Field label="Conexión">
              <Select value={f.connection_type} onChange={(e) => setF({ connection_type: e.target.value })}>
                <option value="usb">USB (conectada al PC del local)</option>
                <option value="network">Red (por IP)</option>
              </Select>
            </Field>

            {f.connection_type === "network" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Field label="IP de la impresora"><Input value={f.host} onChange={(e) => setF({ host: e.target.value })} placeholder="192.168.1.100" /></Field></div>
                <Field label="Puerto"><Input type="number" min="1" max="65535" value={f.port} onChange={(e) => setF({ port: e.target.value })} /></Field>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.has_cash_drawer} onChange={(e) => setF({ has_cash_drawer: e.target.checked })} />
              Tiene caja registradora conectada (se abre al imprimir el ticket)
            </label>

            {modal.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ is_active: e.target.checked })} />
                Impresora activa
              </label>
            )}

            {error && <p className="text-sm font-medium text-red-500">{error}</p>}
          </form>
        )}
      </Modal>

      <Modal
        open={!!aBorrar}
        onClose={() => setABorrar(null)}
        title="Eliminar impresora"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setABorrar(null)}>Cancelar</Button>
            <Button variant="danger" onClick={borrar}>Eliminar</Button>
          </>
        }
      >
        <p className="text-sm text-ink/70">¿Eliminar la impresora <b>{aBorrar?.name}</b>?</p>
      </Modal>
    </Card>
  );
}

// ============================================================================
//  Token del agente de impresión
// ============================================================================
function SeccionAgente() {
  const [agentes, setAgentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [revelado, setRevelado] = useState(null); // { nombre, token }
  const [confirmar, setConfirmar] = useState(null); // { tipo: "rotar" | "revocar", agente }
  const [msg, setMsg] = useState("");
  const [nombre, setNombre] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  async function cargar() {
    const r = await api.get(`${P}/agent-tokens/`);
    setAgentes(r.ok ? await r.json() : []);
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 10000); // refresca el estado "Conectado"
    return () => clearInterval(t);
  }, []);

  async function generar(e) {
    e.preventDefault();
    setMsg("");
    setTrabajando(true);
    const res = await api.post(`${P}/agent-tokens/`, { nombre: nombre.trim() || "PC del local" });
    setTrabajando(false);
    if (res.ok) {
      const d = await res.json();
      setRevelado({ nombre: d.nombre, token: d.token });
      setNombre("");
      cargar();
    } else setMsg(await errorDe(res, "No se pudo generar el token."));
  }

  async function ejecutar() {
    const { tipo, agente } = confirmar;
    setConfirmar(null);
    const res = await api.post(`${P}/agent-tokens/${agente.id}/${tipo}/`, {});
    if (res.ok) {
      const d = await res.json();
      if (tipo === "rotar") setRevelado({ nombre: d.nombre, token: d.token });
      cargar();
    } else setMsg(await errorDe(res, "No se pudo completar la acción."));
  }

  const urlServidor = `${window.location.origin}/api/franquicias/printer`;
  // Editable: en producción es el dominio con el que abriste el panel; si cambia,
  // se corrige aquí y el código se regenera sin crear otro token.
  const [urlEditada, setUrlEditada] = useState("");
  const urlCodigo = normalizarUrlServidor(urlEditada || urlServidor);

  return (
    <Card className="p-6">
      <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><KeyRound size={18} className="text-brand" /> Agente de impresión</h3>
      <p className="mb-4 text-sm text-ink/50">
        El agente es el programa que corre en el PC del local y manda a imprimir. Este token es su llave:
        así solo imprime lo de <b>tu franquicia</b>.
      </p>

      {msg && <p className="mb-3 text-sm font-medium text-red-500">{msg}</p>}

      <Table head={["Agente", "Token", "Estado", "Equipo", ""]}>
        {agentes.map((a) => (
          <tr key={a.id} className="border-b border-sand/60">
            <td className="px-3 py-2 font-medium">{a.nombre}</td>
            <td className="px-3 py-2 font-mono text-ink/60">••••••{a.token_sufijo}</td>
            <td className="px-3 py-2">
              {!a.is_active ? <Pill tone="bad">Revocado</Pill>
                : agenteConectado(a) ? <Pill tone="ok">Conectado</Pill>
                : <Pill tone="warn">Sin conexión</Pill>}
            </td>
            <td className="px-3 py-2 text-ink/60">{a.computadora ? `${a.computadora}${a.version_agente ? ` · v${a.version_agente}` : ""}` : "—"}</td>
            <td className="px-3 py-2">
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmar({ tipo: "rotar", agente: a })}><RefreshCw size={14} /> Generar nuevo</Button>
                {a.is_active && <Button variant="ghost" onClick={() => setConfirmar({ tipo: "revocar", agente: a })}><Ban size={14} /> Revocar</Button>}
              </div>
            </td>
          </tr>
        ))}
        {!cargando && agentes.length === 0 && (
          <tr><td colSpan="5" className="px-3 py-6 text-center text-sm text-ink/40">Todavía no has generado el token del agente.</td></tr>
        )}
      </Table>

      <form onSubmit={generar} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Field label="Nombre del equipo (opcional)">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="PC de caja" />
          </Field>
        </div>
        <Button type="submit" disabled={trabajando}><KeyRound size={16} /> {trabajando ? "Generando…" : "Generar token"}</Button>
      </form>

      <div className="mt-5 max-w-xl">
        <Copiable label="URL del servidor (para configurar en el agente)" value={urlServidor} />
      </div>

      {/* El token en claro solo se ve aquí, una vez */}
      <Modal
        open={!!revelado}
        onClose={() => setRevelado(null)}
        title="Token del agente"
        size="md"
        footer={<Button onClick={() => setRevelado(null)}>Ya lo copié</Button>}
      >
        {revelado && (
          <div className="space-y-3">
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <b>Cópialo ahora.</b> Por seguridad no se vuelve a mostrar. Si lo pierdes, genera uno nuevo
              (el anterior dejará de funcionar).
            </p>
            <Field label="Dirección del servidor (tu dominio)">
              <Input value={urlEditada} onChange={(e) => setUrlEditada(e.target.value)} placeholder={urlServidor} />
            </Field>
            {esLocal(urlCodigo) ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                <b>Esta dirección solo funciona en este mismo equipo.</b> Escribe arriba el dominio real
                del servidor (ej. <code>midominio.com</code>) para que otros equipos puedan conectarse.
              </p>
            ) : (
              <p className="text-xs text-ink/50">Se conectará a: <code>{urlCodigo}</code>. Si el dominio cambia, el agente permite editarlo sin generar otro token.</p>
            )}
            <Copiable label="Código de instalación — pégalo en el agente" value={codigoInstalacion(urlCodigo, revelado.token)} />
            <details className="text-xs text-ink/50">
              <summary className="cursor-pointer">Datos sueltos (Windows / configuración manual)</summary>
              <div className="mt-2 space-y-2">
                <Copiable label={`Token · ${revelado.nombre}`} value={revelado.token} />
                <Copiable label="URL del servidor" value={urlCodigo} />
              </div>
            </details>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        title={confirmar?.tipo === "rotar" ? "Generar un token nuevo" : "Revocar agente"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button variant={confirmar?.tipo === "revocar" ? "danger" : "primary"} onClick={ejecutar}>
              {confirmar?.tipo === "rotar" ? "Generar nuevo" : "Revocar"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink/70">
          {confirmar?.tipo === "rotar"
            ? <>El token actual de <b>{confirmar?.agente.nombre}</b> dejará de funcionar y tendrás que pegar el nuevo en el agente.</>
            : <>El agente <b>{confirmar?.agente.nombre}</b> dejará de imprimir hasta que generes un token nuevo.</>}
        </p>
      </Modal>
    </Card>
  );
}

export default function Impresoras() {
  return (
    <div className="space-y-6">
      <SeccionImpresoras />
      <SeccionAgente />
    </div>
  );
}
