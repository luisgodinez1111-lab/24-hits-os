"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Droplet, MapPin, TrendingUp } from "lucide-react";
import { Badge, Card, CardBody, FormField, Input, Skeleton } from "@24hits/ui";
import type { SalesByZone, SalesSummary, SalesTimeseries, TopSellers } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { BarChart } from "@/components/BarChart";

const money = (v?: string | null) => (v == null ? "—" : `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v?: string | null) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

// Fecha local en formato YYYY-MM-DD (no UTC).
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const zoneLabel: Record<string, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro", SIN_ZONA: "Sin zona / Mostrador" };

type Preset = { key: string; label: string; range: () => { from: string; to: string; granularity: "day" | "month" } };
const today = () => new Date();
const presets: Preset[] = [
  { key: "hoy", label: "Hoy", range: () => ({ from: isoLocal(today()), to: isoLocal(today()), granularity: "day" }) },
  { key: "ayer", label: "Ayer", range: () => ({ from: isoLocal(addDays(today(), -1)), to: isoLocal(addDays(today(), -1)), granularity: "day" }) },
  { key: "7d", label: "7 días", range: () => ({ from: isoLocal(addDays(today(), -6)), to: isoLocal(today()), granularity: "day" }) },
  { key: "30d", label: "30 días", range: () => ({ from: isoLocal(addDays(today(), -29)), to: isoLocal(today()), granularity: "day" }) },
  { key: "mes", label: "Este mes", range: () => ({ from: isoLocal(new Date(today().getFullYear(), today().getMonth(), 1)), to: isoLocal(today()), granularity: "day" }) },
  { key: "12m", label: "12 meses", range: () => ({ from: isoLocal(new Date(today().getFullYear() - 1, today().getMonth(), 1)), to: isoLocal(today()), granularity: "month" }) },
];

export default function DashboardPage() {
  const [from, setFrom] = useState(isoLocal(addDays(today(), -29)));
  const [to, setTo] = useState(isoLocal(today()));
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const [active, setActive] = useState("30d");

  const qs = `from=${from}&to=${to}`;
  const applyPreset = (p: Preset) => {
    const r = p.range();
    setFrom(r.from); setTo(r.to); setGranularity(r.granularity); setActive(p.key);
  };

  const { data: summary } = useQuery({ queryKey: ["dash-sales", from, to], queryFn: () => api.get<SalesSummary>(`/reports/sales?${qs}`) });
  const { data: series, isLoading: loadingSeries } = useQuery({ queryKey: ["dash-ts", from, to, granularity], queryFn: () => api.get<SalesTimeseries>(`/reports/timeseries?${qs}&granularity=${granularity}`) });
  const { data: models } = useQuery({ queryKey: ["dash-models", from, to], queryFn: () => api.get<TopSellers>(`/reports/top-sellers?${qs}&dimension=product&limit=8`) });
  const { data: flavors } = useQuery({ queryKey: ["dash-flavors", from, to], queryFn: () => api.get<TopSellers>(`/reports/top-sellers?${qs}&dimension=flavor&limit=8`) });
  const { data: zones } = useQuery({ queryKey: ["dash-zones", from, to], queryFn: () => api.get<SalesByZone>(`/reports/by-zone?${qs}`) });

  const bars = (series?.points ?? []).map((p) => ({
    label: granularity === "day" ? p.date.slice(8) : p.date.slice(5),
    value: Number(p.billed),
    title: `${p.date} · ${money(p.billed)} · ${p.units} u.`,
  }));
  const zoneMax = Math.max(1, ...(zones?.rows ?? []).map((z) => Number(z.billed)));

  return (
    <div className="space-y-5">
      {/* Rango + presets */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active === p.key ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <FormField label="Desde"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActive(""); }} /></FormField>
        <FormField label="Hasta"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActive(""); }} /></FormField>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Ventas" value={money(summary?.billed)} />
        <Kpi label="Cobrado" value={money(summary?.collected)} />
        <Kpi label="Pedidos" value={summary ? String(summary.orderCount) : "—"} />
        <Kpi label="Ticket prom." value={money(summary?.avgTicket)} />
        {summary?.grossProfit != null
          ? <Kpi label="Utilidad" value={money(summary.grossProfit)} sub={`margen ${pct(summary.margin)}`} accent />
          : <Kpi label="Utilidad" value="—" sub="sin permiso" />}
      </div>

      {/* Serie temporal */}
      <Card>
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4" /> Ventas por {granularity === "day" ? "día" : "mes"}</span>
          <div className="flex gap-1">
            {(["day", "month"] as const).map((g) => (
              <button key={g} onClick={() => setGranularity(g)} className={`rounded px-2 py-1 text-xs font-medium ${granularity === g ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>{g === "day" ? "Día" : "Mes"}</button>
            ))}
          </div>
        </div>
        <CardBody>
          {loadingSeries ? <Skeleton className="h-40 w-full" /> : <BarChart bars={bars} format={(v) => money(String(v))} />}
        </CardBody>
      </Card>

      {/* Top modelos / sabores + zonas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopCard title="Modelos más vendidos" icon={<Award className="h-4 w-4 text-gray-500" />} rows={models?.rows} />
        <TopCard title="Sabores más vendidos" icon={<Droplet className="h-4 w-4 text-gray-500" />} rows={flavors?.rows} />

        <Card>
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <MapPin className="h-4 w-4 text-gray-500" /><span className="text-sm font-semibold">Ventas por zona</span>
          </div>
          <CardBody className="space-y-2">
            {!zones ? <Skeleton className="h-32 w-full" /> : zones.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Sin datos.</p>
            ) : zones.rows.map((z) => (
              <div key={z.zone}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{zoneLabel[z.zone] ?? z.zone}</span>
                  <span className="tabular-nums">{money(z.billed)}{z.grossProfit != null && <span className="ml-2 text-xs text-gray-400">util. {money(z.grossProfit)}</span>}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-brand/80" style={{ width: `${(Number(z.billed) / zoneMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-brand/30 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function TopCard({ title, icon, rows }: { title: string; icon: ReactNode; rows?: TopSellers["rows"] }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => Number(r.units)));
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">{icon}<span className="text-sm font-semibold">{title}</span></div>
      <CardBody className="space-y-2">
        {!rows ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin ventas en el rango.</p>
        ) : rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-center justify-between text-sm">
              <span className="truncate pr-2 font-medium">{r.label}{r.sublabel && <span className="ml-1 text-xs text-gray-400">· {r.sublabel}</span>}</span>
              <span className="shrink-0 tabular-nums">{r.units} u.{Number(r.returnedUnits) > 0 && <Badge tone="amber">−{r.returnedUnits}</Badge>}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100">
              <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${(Number(r.units) / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
