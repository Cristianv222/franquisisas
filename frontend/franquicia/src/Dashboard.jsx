import { useState } from "react";
import { logout, franquiciaId } from "./auth";
import Vender from "./Vender";
import Reportes from "./Reportes";
import Solicitudes from "./Solicitudes";
import Notificaciones from "./Notificaciones";

export default function Dashboard() {
  const [tab, setTab] = useState("vender");
  const tabs = [
    ["vender", "Vender"],
    ["reportes", "Reportes"],
    ["solicitudes", "Solicitudes"],
  ];
  return (
    <div>
      <div className="barra">
        <strong>Panel de franquicia #{franquiciaId()}</strong>
        <button className="sec" onClick={() => { logout(); window.location.reload(); }}>
          Salir
        </button>
      </div>
      <div className="contenedor">
        <div className="tabs">
          {tabs.map(([k, l]) => (
            <div key={k} className={"tab" + (tab === k ? " activo" : "")} onClick={() => setTab(k)}>
              {l}
            </div>
          ))}
        </div>
        {tab === "vender" && <Vender />}
        {tab === "reportes" && <Reportes />}
        {tab === "solicitudes" && <Solicitudes />}
      </div>
      <Notificaciones />
    </div>
  );
}
