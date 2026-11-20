import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  LayoutDashboard, Store, UtensilsCrossed, Warehouse, Boxes, Inbox, BarChart3,
  LogOut, Bell, ChevronLeft, ChevronRight, Inbox as InboxIcon, PackageX, Users,
} from "lucide-react";
import { logout, claims } from "./auth";
import { api } from "./api";
import { Modal, Button } from "./ui";
import logoFull from "./assets/logo-full.png";
import logoIcon from "./assets/logo-icon.png";
import Dashboard from "./Dashboard";
import Franquicias from "./Franquicias";
import Menu from "./Menu";
import Insumos from "./Insumos";
import Inventario from "./Inventario";
import Solicitudes from "./Solicitudes";
import Reportes from "./Reportes";
import Usuarios from "./Usuarios";

const NAV = [
  ["dashboard", "Dashboard", LayoutDashboard, Dashboard],
  ["franquicias", "Franquicias", Store, Franquicias],
  ["menu", "Menú", UtensilsCrossed, Menu],
  ["insumos", "Bodega general", Warehouse, Insumos],
  ["inventario", "Inventario", Boxes, Inventario],
  ["solicitudes", "Solicitudes", Inbox, Solicitudes],
  ["reportes", "Reportes", BarChart3, Reportes],
  ["usuarios", "Usuarios", Users, Usuarios],
];

export default function Layout() {
  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [confirmSalir, setConfirmSalir] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [solis, setSolis] = useState([]);
  const [bajos, setBajos] = useState([]);
  const usuario = claims()?.username || "admin";
  const current = NAV.find((n) => n[0] === active);
  const Current = current[3];

  // Píldora deslizante: mide la posición del ítem activo y la anima.
  const navRefs = useRef({});
  const [ind, setInd] = useState({ top: 0, height: 0, ready: false });
  useLayoutEffect(() => {
    const el = navRefs.current[active];
    if (el) setInd({ top: el.offsetTop, height: el.offsetHeight, ready: true });
  }, [active, collapsed]);
  useEffect(() => {
    const onResize = () => {
      const el = navRefs.current[active];
      if (el) setInd((p) => ({ ...p, top: el.offsetTop, height: el.offsetHeight }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  async function cargarNotifs() {
    const s = await api.get("/franquicias/solicitudes/");
    if (s.ok) setSolis((await s.json()).filter((x) => x.estado === "PENDIENTE"));
    const b = await api.get("/franquicias/reportes/stock-bajo/");
    if (b.ok) setBajos(await b.json());
  }
  useEffect(() => { cargarNotifs(); }, [active]);

  const notifs = [
    ...solis.map((s) => ({ icon: InboxIcon, texto: `Solicitud de producto: ${s.nombre}`, sub: `Franquicia #${s.franquicia_id}`, tab: "solicitudes" })),
    ...bajos.map((b) => ({ icon: PackageX, texto: `Stock bajo: ${b.materia_prima}`, sub: `${b.franquicia} · ${b.cantidad_actual} ${b.unidad.toLowerCase()}`, tab: "inventario" })),
  ];

  return (
    <div className="flex h-full p-3">
      <aside className={`relative flex flex-col rounded-2xl bg-ink text-white transition-all duration-200 ${collapsed ? "w-[72px]" : "w-60"}`}>
        <div className="flex items-center justify-center px-4 py-5">
          <img src={collapsed ? logoIcon : logoFull} alt="FRANQOR" className={collapsed ? "h-9 w-9 object-contain" : "h-10 object-contain"} />
        </div>

        <nav className="relative flex-1 px-3">
          {/* Píldora deslizante del ítem activo */}
          <div
            className="nav-indicator pointer-events-none absolute left-3 right-3 top-0 rounded-xl bg-brand shadow-md shadow-brand/30"
            style={{ transform: `translateY(${ind.top}px)`, height: ind.height, opacity: ind.ready ? 1 : 0 }}
          />
          <div className="space-y-1">
            {NAV.map(([k, label, Icon]) => (
              <button
                key={k}
                ref={(el) => (navRefs.current[k] = el)}
                onClick={() => setActive(k)}
                title={label}
                className={`relative z-10 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active === k ? "text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <Icon size={19} /> {!collapsed && label}
              </button>
            ))}
          </div>
        </nav>

        <button
          onClick={() => setConfirmSalir(true)}
          title="Salir"
          className={`m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:bg-white/10 hover:text-white ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut size={19} /> {!collapsed && "Salir"}
        </button>
        {!collapsed && <div className="pb-3 text-center text-[10px] text-white/30">Por FronteraTech</div>}

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-20 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-sand bg-white text-ink shadow-md transition hover:text-brand"
          title={collapsed ? "Expandir" : "Contraer"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      <main className="ml-3 flex-1 overflow-auto rounded-2xl bg-white">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sand bg-white px-6 py-3">
          <h1 className="text-lg font-semibold">{current[1]}</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button onClick={() => setNotifOpen((o) => !o)} className="relative rounded-lg p-2 text-ink/60 hover:bg-sand/60" title="Notificaciones">
                <Bell size={18} />
                {notifs.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{notifs.length}</span>}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-sand bg-white shadow-xl">
                    <div className="border-b border-sand px-4 py-2.5 text-sm font-semibold">Notificaciones</div>
                    <div className="max-h-96 overflow-auto">
                      {notifs.map((n, i) => (
                        <button key={i} onClick={() => { setActive(n.tab); setNotifOpen(false); }} className="flex w-full items-start gap-3 border-b border-sand/60 px-4 py-3 text-left hover:bg-sand/40">
                          <n.icon size={16} className="mt-0.5 shrink-0 text-brand" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{n.texto}</div>
                            <div className="truncate text-xs text-ink/50">{n.sub}</div>
                          </div>
                        </button>
                      ))}
                      {notifs.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink/40">Sin notificaciones.</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{usuario[0]?.toUpperCase()}</div>
              <div className="leading-tight">
                <div className="text-sm font-medium">{usuario}</div>
                <div className="text-xs text-ink/50">Administrador</div>
              </div>
            </div>
          </div>
        </header>
        <div key={active} className="animate-panel p-8"><Current /></div>
      </main>

      <Modal
        open={confirmSalir}
        onClose={() => setConfirmSalir(false)}
        title="Cerrar sesión"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSalir(false)}>Cancelar</Button>
            <Button variant="danger" onClick={() => { logout(); window.location.replace("/"); }}>Cerrar sesión</Button>
          </>
        }
      >
        <p className="text-sm text-ink/70">¿Seguro que quieres cerrar sesión?</p>
      </Modal>
    </div>
  );
}
