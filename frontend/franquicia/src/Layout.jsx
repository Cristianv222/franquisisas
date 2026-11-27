import { useEffect, useState } from "react";
import {
  ShoppingCart, BarChart3, Inbox, LogOut, ChevronLeft, ChevronRight,
  UtensilsCrossed, Boxes, Store, Users, Receipt, Settings, Printer,
} from "lucide-react";
import { logout, claims, esAdminFranquicia } from "./auth";
import { api } from "./api";
import { Modal, Button } from "./ui";
import logoIcon from "./assets/logo-icon.png";
import Vender from "./Vender";
import Ordenes from "./Ordenes";
import MenuView from "./MenuView";
import Inventario from "./Inventario";
import Reportes from "./Reportes";
import Solicitudes from "./Solicitudes";
import Usuarios from "./Usuarios";
import Config from "./Config";
import Impresoras from "./Impresoras";
import Notificaciones from "./Notificaciones";

// El último campo indica si la pestaña es solo para el administrador de la
// franquicia. El cajero solo ve POS, Órdenes y Reportes (para entregar la caja).
const NAV = [
  ["vender", "POS", ShoppingCart, Vender, false],
  ["ordenes", "Órdenes", Receipt, Ordenes, false],
  ["menu", "Menú", UtensilsCrossed, MenuView, true],
  ["inventario", "Inventario", Boxes, Inventario, true],
  ["reportes", "Reportes", BarChart3, Reportes, false],
  ["solicitudes", "Solicitudes", Inbox, Solicitudes, true],
  ["usuarios", "Usuarios", Users, Usuarios, true],
  ["impresoras", "Impresoras", Printer, Impresoras, true],
  ["config", "Configuración", Settings, Config, true],
];

export default function Layout() {
  const [active, setActive] = useState("vender");
  const [collapsed, setCollapsed] = useState(false);
  const [confirmSalir, setConfirmSalir] = useState(false);
  const [franq, setFranq] = useState(null);
  const usuario = claims()?.username || "Franquicia";
  const adminFran = esAdminFranquicia();
  const nav = NAV.filter((n) => !n[4] || adminFran);
  const current = nav.find((n) => n[0] === active) || nav[0];
  const Current = current[3];
  // El POS no se desplaza completo: solo la lista de productos (ver Vender.jsx).
  const esPOS = current[0] === "vender";

  useEffect(() => {
    api.get("/franquicias/franquicias/mia/").then(async (r) => {
      if (r.ok) setFranq(await r.json());
    });
  }, []);

  const nombreFranq = franq?.nombre || "Mi franquicia";

  return (
    <div className="flex h-full p-3">
      <aside className={`relative flex flex-col rounded-2xl bg-ink text-white transition-all duration-200 ${collapsed ? "w-[72px]" : "w-60"}`}>
        <div className="px-4 py-5">
          {collapsed ? (
            <div className="flex items-center justify-center">
              {franq?.logo ? (
                <img src={franq.logo} alt={nombreFranq} className="h-10 w-10 rounded-xl bg-white object-contain p-1" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Store size={20} className="text-white/80" /></div>
              )}
            </div>
          ) : (
            <>
              {/* Co-branding: logo de la franquicia × FRANQOR */}
              <div className="flex items-center justify-center gap-3">
                {franq?.logo ? (
                  <img src={franq.logo} alt={nombreFranq} className="h-14 w-14 rounded-xl bg-white object-contain p-1" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10"><Store size={26} className="text-white/80" /></div>
                )}
                <span className="text-lg font-light text-white/30">×</span>
                <img src={logoIcon} alt="FRANQOR" className="h-11 w-11 object-contain" />
              </div>
              <div className="mt-3 truncate text-center text-sm font-semibold">{nombreFranq}</div>
              <div className="text-center text-xs font-medium tracking-[0.2em] text-brand">FRANQOR</div>
            </>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {nav.map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setActive(k)}
              title={label}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active === k ? "bg-brand text-white shadow-md shadow-brand/30" : "text-white/60 hover:bg-white/10 hover:text-white"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={19} /> {!collapsed && label}
            </button>
          ))}
        </nav>

        <button
          onClick={() => setConfirmSalir(true)}
          title="Salir"
          className={`m-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:bg-white/10 hover:text-white ${collapsed ? "justify-center" : ""}`}
        >
          <LogOut size={19} /> {!collapsed && "Salir"}
        </button>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -right-3 top-16 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-sand bg-white text-ink shadow-md transition hover:text-brand"
          title={collapsed ? "Expandir" : "Contraer"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      <main className={`ml-3 min-w-0 flex-1 rounded-2xl bg-white ${esPOS ? "overflow-auto lg:flex lg:flex-col lg:overflow-hidden" : "overflow-auto"}`}>
        <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-sand bg-white px-6 py-3">
          <h1 className="text-lg font-semibold">{current[1]}</h1>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{usuario[0]?.toUpperCase()}</div>
            <div className="leading-tight">
              <div className="text-sm font-medium">{usuario}</div>
              <div className="text-xs text-ink/50">{adminFran ? "Administrador" : "Cajero"} · {nombreFranq}</div>
            </div>
          </div>
        </header>
        <div className={esPOS ? "p-4 lg:min-h-0 lg:flex-1 lg:p-5" : "p-8"}><Current /></div>
      </main>

      <Notificaciones />

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
