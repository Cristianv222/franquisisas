import { useEffect, useState } from "react";
import { api } from "./api";
import { Card, Table } from "./ui";

export default function Reportes() {
  const [ventas, setVentas] = useState(null);
  const [consumo, setConsumo] = useState([]);
  const [stock, setStock] = useState([]);

  useEffect(() => {
    (async () => {
      setVentas(await (await api.get("/franquicias/reportes/ventas/")).json());
      setConsumo(await (await api.get("/franquicias/reportes/consumo/")).json());
      setStock(await (await api.get("/franquicias/reportes/stock/")).json());
    })();
  }, []);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-1 text-base font-semibold">Ventas (global)</h3>
        {ventas ? (
          <>
            <p className="mb-4 text-sm text-ink/60">
              Total: <strong>{ventas.total.cantidad}</strong> ventas · ${ventas.total.monto || 0}
            </p>
            <Table head={["Método de pago", "Cantidad", "Monto"]}>
              {ventas.por_metodo_pago.map((r) => (
                <tr key={r.metodo_pago} className="border-b border-sand/60">
                  <td className="px-3 py-2">{r.metodo_pago}</td>
                  <td className="px-3 py-2">{r.cantidad}</td>
                  <td className="px-3 py-2">${r.monto}</td>
                </tr>
              ))}
            </Table>
          </>
        ) : <p className="text-sm text-ink/40">Cargando…</p>}
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Consumo de materia prima (global)</h3>
        <Table head={["Materia prima", "Consumo total"]}>
          {consumo.map((c, i) => (
            <tr key={i} className="border-b border-sand/60">
              <td className="px-3 py-2">{c.materia_prima__nombre}</td>
              <td className="px-3 py-2"><b>{c.consumo_total}</b> <span className="text-ink/50">{c.materia_prima__unidad?.toLowerCase()}</span></td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="p-6">
        <h3 className="mb-4 text-base font-semibold">Stock por franquicia</h3>
        <Table head={["Franquicia", "Materia prima", "Unidad", "Cantidad"]}>
          {stock.map((s, i) => (
            <tr key={i} className="border-b border-sand/60">
              <td className="px-3 py-2">{s.franquicia_id}</td>
              <td className="px-3 py-2">{s.materia_prima}</td>
              <td className="px-3 py-2">{s.unidad}</td>
              <td className="px-3 py-2 font-medium">{s.cantidad_actual}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
