import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getAccess } from "./auth";

export default function Notificaciones() {
  const [eventos, setEventos] = useState([]);

  useEffect(() => {
    const token = getAccess();
    if (!token) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/?token=${token}`);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.tipo === "notificacion") {
          const id = Date.now();
          setEventos((prev) => [{ id, mensaje: data.payload.mensaje }, ...prev].slice(0, 4));
          setTimeout(() => setEventos((prev) => prev.filter((x) => x.id !== id)), 6000);
        }
      } catch { /* ignora */ }
    };
    return () => ws.close();
  }, []);

  if (eventos.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 space-y-2">
      {eventos.map((e) => (
        <div key={e.id} className="flex items-start gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
          <Bell size={16} className="mt-0.5 shrink-0 text-brand" />
          <span>{e.mensaje}</span>
        </div>
      ))}
    </div>
  );
}
