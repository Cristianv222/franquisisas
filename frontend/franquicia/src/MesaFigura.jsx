import { Users } from "lucide-react";

// Tamaño de la mesa según su capacidad (más sillas = mesa más grande).
function dims(forma, capacidad) {
  const base = Math.min(92, Math.max(48, 44 + (Number(capacidad || 4) - 2) * 6));
  if (forma === "BARRA") return { w: Math.round(base * 1.8), h: Math.round(base * 0.7) };
  return { w: base, h: base };
}

export default function MesaFigura({ mesa, selected, dragging, onPointerDown, onClick, interactive }) {
  const { w, h } = dims(mesa.forma, mesa.capacidad);
  const redonda = mesa.forma === "REDONDA";
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{ left: `${mesa.pos_x}%`, top: `${mesa.pos_y}%`, width: w, height: h }}
      className={[
        "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border-2 text-center transition-colors select-none",
        redonda ? "rounded-full" : "rounded-xl",
        interactive ? "cursor-pointer" : "",
        dragging ? "cursor-grabbing ring-2 ring-brand/50" : "",
        selected
          ? "border-brand bg-brand text-white shadow-lg"
          : "border-sand bg-white text-ink hover:border-brand",
      ].join(" ")}
      title={`Mesa ${mesa.numero} · ${mesa.capacidad} pers.`}
    >
      <span className="text-base font-bold leading-none">{mesa.numero}</span>
      <span className={`mt-0.5 flex items-center gap-0.5 text-[10px] ${selected ? "text-white/80" : "text-ink/40"}`}>
        <Users size={9} /> {mesa.capacidad}
      </span>
    </div>
  );
}
