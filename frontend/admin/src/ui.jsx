import { X } from "lucide-react";

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-sand/70 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...p }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-brand text-white hover:bg-brand/90",
    ghost: "bg-sand/60 text-ink hover:bg-sand",
    outline: "border border-sand text-ink hover:bg-sand/40",
    danger: "bg-red-500 text-white hover:bg-red-600",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...p}>
      {children}
    </button>
  );
}

export function Field({ label, req, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink/60">
        {label}
        {req && <span className="text-brand"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function Input({ className = "", ...p }) {
  return (
    <input
      className={`w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-brand ${className}`}
      {...p}
    />
  );
}

export function Select({ children, className = "", ...p }) {
  return (
    <select
      className={`w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm outline-none focus:border-brand ${className}`}
      {...p}
    >
      {children}
    </select>
  );
}

export function Modal({ open, onClose, title, children, footer, size = "lg" }) {
  if (!open) return null;
  const w = size === "xl" ? "max-w-2xl" : size === "md" ? "max-w-md" : "max-w-lg";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${w} rounded-2xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink/50 hover:bg-sand/60">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-sand px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-sand/70 text-ink",
    ok: "bg-green-100 text-green-700",
    warn: "bg-amber-100 text-amber-700",
    bad: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sand text-left text-xs uppercase tracking-wide text-ink/40">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
