import { useEffect, useState } from "react";
import { Receipt, DollarSign, Boxes } from "lucide-react";
import { api } from "./api";
import { Card, Table } from "./ui";

function Kpi({ icon: Icon, label, value }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="rounded-xl bg-brand-soft/40 p-3 text-brand"><Icon size={22} /></div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-ink/60">{label}</div>
      </div>
    </Card>
  );
}

export default function Reportes() {
  const [ventas, setVentas] = useState(null);
  const [stock, setStock] = useState([]);
  const [consumo, setConsumo] = useState([]);

  useEffect(() => {
    (async () => {
      const v = await api.get("/franquicias/reportes/ventas/"); if (v.ok) setVentas(await v.json());
      const s = await api.get("/franquicias/reportes/stock/"); if (s.ok) setStock(await s.json());
      const c = await api.get("/franquicias/reportes/consumo/"); if (c.ok) setConsumo(await c.json());
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi icon={Receipt} label="Ventas" value={ventas?.total?.cantidad ?? 0} />
        <Kpi icon={DollarSign} label="Ingresos" value={`$${ventas?.total?.monto ?? 0}`} />
        <Kpi icon={Boxes} label="Insumos en stock" value={stock.length} />
      </div>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Ventas por método de pago</h3>
        <Table head={["Método de pago", "Cantidad", "Monto"]}>
          {(ventas?.por_metodo_pago || []).map((r) => (
            <tr key={r.metodo_pago} className="border-b border-sand/60">
              <td className="px-3 py-2">{r.metodo_pago}</td>
              <td className="px-3 py-2">{r.cantidad}</td>
              <td className="px-3 py-2">${r.monto}</td>
            </tr>
          ))}
          {(!ventas || ventas.por_metodo_pago.length === 0) && <tr><td colSpan="3" className="px-3 py-6 text-center text-sm text-ink/40">Sin ventas aún.</td></tr>}
        </Table>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-4 text-base font-semibold">Stock actual</h3>
          <Table head={["Materia prima", "Unidad", "Cantidad"]}>
            {stock.map((s, i) => (
              <tr key={i} className="border-b border-sand/60">
                <td className="px-3 py-2">{s.materia_prima}</td>
                <td className="px-3 py-2 text-ink/60">{s.unidad}</td>
                <td className="px-3 py-2 font-medium">{s.cantidad_actual}</td>
              </tr>
            ))}
            {stock.length === 0 && <tr><td colSpan="3" className="px-3 py-6 text-center text-sm text-ink/40">Sin stock.</td></tr>}
          </Table>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-base font-semibold">Consumo de materia prima</h3>
          <Table head={["Materia prima", "Consumo total"]}>
            {consumo.map((c, i) => (
              <tr key={i} className="border-b border-sand/60">
                <td className="px-3 py-2">{c.materia_prima__nombre}</td>
                <td className="px-3 py-2"><b>{c.consumo_total}</b> <span className="text-ink/50">{c.materia_prima__unidad?.toLowerCase()}</span></td>
              </tr>
            ))}
            {consumo.length === 0 && <tr><td colSpan="2" className="px-3 py-6 text-center text-sm text-ink/40">Sin consumo aún.</td></tr>}
          </Table>
        </Card>
      </div>
    </div>
  );
}
