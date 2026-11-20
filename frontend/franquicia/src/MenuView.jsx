import { useEffect, useState } from "react";
import { UtensilsCrossed, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "./api";

export default function MenuView() {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const r = await api.get("/franquicias/items/disponibles/");
    setItems(r.ok ? await r.json() : []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink/60">
        Productos asignados a tu franquicia. Verde = listo para vender; rojo = falta insumo.
      </p>

      {cargando ? (
        <p className="py-8 text-center text-sm text-ink/40">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-ink/40">
          <UtensilsCrossed size={28} />
          <p className="text-sm">Todavía no hay productos asignados a tu franquicia.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => (
            <div key={it.id} className="overflow-hidden rounded-xl border border-sand bg-white shadow-sm">
              {it.imagen ? (
                <img src={it.imagen} alt="" className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-sand text-ink/30">
                  <UtensilsCrossed size={28} />
                </div>
              )}
              <div className="p-3">
                <div className="truncate font-medium">{it.nombre}</div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-semibold text-brand">${it.precio}</span>
                  {it.disponible ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 size={13} /> Disponible
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-500">
                      <AlertCircle size={13} /> {it.sin_receta ? "Sin receta" : "Sin stock"}
                    </span>
                  )}
                </div>
                {!it.disponible && it.faltantes?.length > 0 && (
                  <div className="mt-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] leading-tight text-red-600">
                    Falta: {it.faltantes.join(", ")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
