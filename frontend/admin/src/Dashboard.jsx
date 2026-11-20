import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Store, Receipt, DollarSign, AlertTriangle, Warehouse, Inbox, PackagePlus, TrendingUp,
} from "lucide-react";
import { api } from "./api";
import { Card } from "./ui";

const METODO_LABEL = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", DEUNA: "De una (QR)", TARJETA: "Tarjeta" };
const METODO_COLOR = { EFECTIVO: "#22c55e", TRANSFERENCIA: "#3b82f6", DEUNA: "#8b5cf6", TARJETA: "#fd7b41" };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const money = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mesLabel = (k) => { const [y, m] = k.split("-"); return `${MESES[Number(m) - 1]} ${y.slice(2)}`; };

function Kpi({ icon: Icon, label, value, sub, tone = "brand" }) {
  const tones = {
    brand: "bg-brand-soft/40 text-brand",
    ink: "bg-ink/5 text-ink",
    red: "bg-red-100 text-red-600",
    green: "bg-green-100 text-green-600",
  };
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className={`rounded-xl p-3 ${tones[tone]}`}><Icon size={22} /></div>
      <div className="min-w-0">
        <div className="truncate text-2xl font-bold">{value}</div>
        <div className="text-sm text-ink/60">{label}</div>
        {sub && <div className="text-xs text-ink/40">{sub}</div>}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [ventas, setVentas] = useState(null);
  const [bajos, setBajos] = useState([]);
  const [franquicias, setFranquicias] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [serieMensual, setSerieMensual] = useState([]);
  const [pendientes, setPendientes] = useState({ productos: 0, insumos: 0 });

  useEffect(() => {
    (async () => {
      const r = await api.get("/franquicias/reportes/por-franquicia/");
      if (r.ok) setData(await r.json());
      const v = await api.get("/franquicias/reportes/ventas/");
      if (v.ok) setVentas(await v.json());
      const b = await api.get("/franquicias/reportes/stock-bajo/");
      if (b.ok) setBajos(await b.json());
      const f = await api.get("/franquicias/franquicias/");
      if (f.ok) setFranquicias(await f.json());
      const mp = await api.get("/franquicias/materias-primas/");
      if (mp.ok) setMaterias(await mp.json());
      const sol = await api.get("/franquicias/solicitudes/");
      const soli = await api.get("/franquicias/solicitudes-insumo/");
      setPendientes({
        productos: sol.ok ? (await sol.json()).filter((x) => x.estado === "PENDIENTE").length : 0,
        insumos: soli.ok ? (await soli.json()).filter((x) => x.estado === "PENDIENTE").length : 0,
      });
      const vl = await api.get("/franquicias/ventas/");
      if (vl.ok) {
        const lista = await vl.json();
        const porMes = {};
        lista.forEach((x) => {
          const k = (x.fecha_venta || x.creado_en || "").slice(0, 7);
          if (!k) return;
          porMes[k] = porMes[k] || { mes: k, monto: 0, cantidad: 0 };
          porMes[k].monto += Number(x.monto_total || 0);
          porMes[k].cantidad += 1;
        });
        setSerieMensual(
          Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)).map((x) => ({ ...x, label: mesLabel(x.mes) }))
        );
      }
    })();
  }, []);

  const totalMonto = ventas?.total?.monto ?? data.reduce((a, d) => a + d.monto, 0);
  const totalVentas = ventas?.total?.cantidad ?? 0;
  const activas = franquicias.filter((f) => f.estado === "ACTIVA").length;
  const valorBodega = materias.reduce((a, m) => a + Number(m.valor || 0), 0);
  const pagos = (ventas?.por_metodo_pago || []).map((p) => ({
    name: METODO_LABEL[p.metodo_pago] || p.metodo_pago,
    value: Number(p.monto || 0),
    color: METODO_COLOR[p.metodo_pago] || "#9a9a98",
  })).filter((p) => p.value > 0);
  const topFranquicias = [...data].sort((a, b) => b.monto - a.monto).slice(0, 5);
  const maxTop = topFranquicias[0]?.monto || 1;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={DollarSign} label="Ingresos totales" value={money(totalMonto)} sub={`${totalVentas} ventas`} />
        <Kpi icon={Store} label="Franquicias activas" value={`${activas}/${franquicias.length}`} sub="en operación" tone="ink" />
        <Kpi icon={Warehouse} label="Valor de bodega" value={money(valorBodega)} sub={`${materias.length} insumos`} tone="green" />
        <Kpi icon={AlertTriangle} label="Alertas de stock bajo" value={bajos.length} sub="insumos por reponer" tone="red" />
      </div>

      {/* Registro de ventas + resumen lateral */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-base font-semibold">Registro de ventas</h3>
          <p className="mb-4 text-sm text-ink/50">Ingresos por mes (todas las franquicias)</p>
          {serieMensual.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink/40">Aún no hay ventas registradas.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={serieMensual} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e7e6" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#3c4044" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#9a9a98" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f0efed" }} formatter={(v, n) => [money(v), n === "monto" ? "Ingresos" : n]} />
                <Bar dataKey="monto" name="Ingresos" fill="#fd7b41" radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Line type="monotone" dataKey="monto" name="Tendencia" stroke="#3c4044" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="space-y-6">
          {/* Total destacado */}
          <div className="rounded-2xl bg-gradient-to-br from-brand to-brand/70 p-6 text-white shadow-lg shadow-brand/20">
            <div className="flex items-center gap-2 text-sm text-white/80"><TrendingUp size={16} /> Ingresos totales</div>
            <div className="mt-2 text-3xl font-bold">{money(totalMonto)}</div>
            <div className="mt-1 text-sm text-white/70">{totalVentas} ventas · {activas} franquicias activas</div>
          </div>

          {/* Métodos de pago */}
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold">Métodos de pago</h3>
            {pagos.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/40">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pagos} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {pagos.map((p, i) => <Cell key={i} fill={p.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </div>

      {/* Rendimiento por franquicia + alertas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-base font-semibold">Rendimiento por franquicia</h3>
          <p className="mb-4 text-sm text-ink/50">Ingresos ($) de cada franquicia</p>
          {data.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink/40">Aún no hay datos de ventas.</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e7e6" />
                <XAxis dataKey="nombre" tick={{ fontSize: 12, fill: "#3c4044" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#9a9a98" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f0efed" }} formatter={(v) => [money(v), "Ingresos"]} />
                <Bar dataKey="monto" name="Ingresos" fill="#fd7b41" radius={[4, 4, 0, 0]} maxBarSize={56} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <div className="space-y-6">
          {/* Pendientes */}
          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Solicitudes pendientes</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-sand/40 px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><Inbox size={15} className="text-brand" /> Productos</span>
                <span className="font-bold">{pendientes.productos}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-sand/40 px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><PackagePlus size={15} className="text-brand" /> Insumos</span>
                <span className="font-bold">{pendientes.insumos}</span>
              </div>
            </div>
          </Card>

          {/* Stock bajo */}
          <Card className="p-5">
            <h3 className="mb-3 flex items-center justify-between text-sm font-semibold">
              Alertas de stock bajo
              {bajos.length > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">{bajos.length}</span>}
            </h3>
            {bajos.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/40">Todo en orden ✓</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-auto">
                {bajos.map((b, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-sand/50 pb-2 text-sm last:border-0">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{b.materia_prima}</div>
                      <div className="truncate text-xs text-ink/50">{b.franquicia}</div>
                    </div>
                    <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                      {Number(b.cantidad_actual)} / {Number(b.umbral)} {b.unidad.toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Top franquicias */}
      {topFranquicias.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 text-base font-semibold">Top franquicias por ingresos</h3>
          <div className="space-y-3">
            {topFranquicias.map((f, i) => (
              <div key={f.franquicia_id} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft/40 text-xs font-bold text-brand">{i + 1}</span>
                <span className="w-40 shrink-0 truncate text-sm font-medium">{f.nombre}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand/60">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (f.monto / maxTop) * 100)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-sm font-semibold">{money(f.monto)}</span>
                <span className="w-16 shrink-0 text-right text-xs text-ink/50">{f.cantidad} vts</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
