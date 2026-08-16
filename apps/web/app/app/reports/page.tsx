"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, Droplet, MapPin, TrendingUp, UserX } from "lucide-react";
import { Badge, Card, CardBody, FormField, Input, Skeleton } from "@24hits/ui";
import type { InactiveCustomers, SalesByZone, SalesSummary, SalesTimeseries, TopSellers } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { BarChart } from "@/components/BarChart";

const money = (v?: string | null) => (v == null ? "—" : `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v?: string | null) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`);

// Fecha local en formato YYYY-MM-DD (no UTC).
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseLocal = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y!, m! - 1, d!); };

// Variación relativa vs. el periodo anterior. hasPrev=false marca "nuevo"
// (antes 0, ahora >0). Devuelve null si no hay nada que comparar.
function deltaOf(cur?: string | number | null, prev?: string | number | null): { pct: number; hasPrev: boolean } | null {
  if (cur == null || prev == null) return null;
  const c = Number(cur), p = Number(prev);
  if (p === 0) return c > 0 ? { pct: 0, hasPrev: false } : null;
  return { pct: (c - p) / p, hasPrev: true };
}

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

  // Periodo anterior de igual duración, para el comparativo.
  const days = Math.round((parseLocal(to).getTime() - parseLocal(from).getTime()) / 86400000) + 1;
  const prevTo = isoLocal(addDays(parseLocal(from), -1));
  const prevFrom = isoLocal(addDays(parseLocal(from), -days));

  const { data: summary } = useQuery({ queryKey: ["dash-sales", from, to], queryFn: () => api.get<SalesSummary>(`/reports/sales?${qs}`) });
  const { data: summaryPrev } = useQuery({ queryKey: ["dash-sales-prev", prevFrom, prevTo], queryFn: () => api.get<SalesSummary>(`/reports/sales?from=${prevFrom}&to=${prevTo}`) });
  const { data: series, isLoading: loadingSeries } = useQuery({ queryKey: ["dash-ts", from, to, granularity], queryFn: () => api.get<SalesTimeseries>(`/reports/timeseries?${qs}&granularity=${granularity}`) });
  const { data: models } = useQuery({ queryKey: ["dash-models", from, to], queryFn: () => api.get<TopSellers>(`/reports/top-sellers?${qs}&dimension=product&limit=8`) });
  const { data: flavors } = useQuery({ queryKey: ["dash-flavors", from, to], queryFn: () => api.get<TopSellers>(`/reports/top-sellers?${qs}&dimension=flavor&limit=8`) });
  const { data: zones } = useQuery({ queryKey: ["dash-zones", from, to], queryFn: () => api.get<SalesByZone>(`/reports/by-zone?${qs}`) });

  // Sabores por modelo (drill-down): al elegir un modelo, sus sabores más vendidos.
  const [model, setModel] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!model && models?.rows?.length) setModel({ id: models.rows[0]!.key, name: models.rows[0]!.label });
  }, [models, model]);
  const { data: modelFlavors } = useQuery({
    queryKey: ["dash-model-flavors", from, to, model?.id],
    queryFn: () => api.get<TopSellers>(`/reports/top-sellers?${qs}&dimension=flavor&productId=${model!.id}&limit=10`),
    enabled: !!model,
  });

  // Clientes inactivos: independiente del rango, usa su propio umbral de días.
  const [inactiveDays, setInactiveDays] = useState(30);
  const { data: inactive } = useQuery({ queryKey: ["dash-inactive", inactiveDays], queryFn: () => api.get<InactiveCustomers>(`/customers/inactive?days=${inactiveDays}`) });

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

      {/* KPIs con comparativo vs. periodo anterior */}
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Ventas" value={money(summary?.billed)} delta={deltaOf(summary?.billed, summaryPrev?.billed)} />
          <Kpi label="Cobrado" value={money(summary?.collected)} delta={deltaOf(summary?.collected, summaryPrev?.collected)} />
          <Kpi label="Pedidos" value={summary ? String(summary.orderCount) : "—"} delta={deltaOf(summary?.orderCount, summaryPrev?.orderCount)} />
          <Kpi label="Ticket prom." value={money(summary?.avgTicket)} delta={deltaOf(summary?.avgTicket, summaryPrev?.avgTicket)} />
          {summary?.grossProfit != null
            ? <Kpi label="Utilidad" value={money(summary.grossProfit)} sub={`margen ${pct(summary.margin)}`} delta={deltaOf(summary.grossProfit, summaryPrev?.grossProfit)} accent />
            : <Kpi label="Utilidad" value="—" sub="sin permiso" />}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">▲▼ comparado con el periodo anterior ({prevFrom} → {prevTo})</p>
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
        <TopCard title="Modelos más vendidos" icon={<Award className="h-4 w-4 text-gray-500" />} rows={models?.rows} onSelect={setModel} selectedKey={model?.id} />
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

      {/* Sabores por modelo (drill-down del modelo seleccionado) */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Droplet className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold">Sabores por modelo</span>
          {model && <Badge tone="brand">{model.name}</Badge>}
          <span className="ml-auto text-[10px] text-gray-400">elige un modelo en “Modelos más vendidos”</span>
        </div>
        <CardBody className="space-y-2">
          {!model ? (
            <p className="py-6 text-center text-sm text-gray-400">Selecciona un modelo arriba para ver sus sabores.</p>
          ) : !modelFlavors ? (
            <Skeleton className="h-28 w-full" />
          ) : modelFlavors.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Sin ventas de sabores para {model.name} en el rango.</p>
          ) : (() => {
            const fmax = Math.max(1, ...modelFlavors.rows.map((r) => Number(r.units)));
            return modelFlavors.rows.map((r) => (
              <div key={r.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2 font-medium">{r.label}</span>
                  <span className="shrink-0 tabular-nums">{r.units} u.{Number(r.returnedUnits) > 0 && <Badge tone="amber">−{r.returnedUnits}</Badge>}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${(Number(r.units) / fmax) * 100}%` }} />
                </div>
              </div>
            ));
          })()}
        </CardBody>
      </Card>

      {/* Clientes que dejaron de comprar (retención) */}
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
          <UserX className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold">Clientes que dejaron de comprar</span>
          {inactive && <Badge tone={inactive.count > 0 ? "amber" : "green"}>{inactive.count}</Badge>}
          <div className="ml-auto flex gap-1">
            {[30, 60, 90].map((d) => (
              <button key={d} onClick={() => setInactiveDays(d)} className={`rounded px-2 py-1 text-xs font-medium ${inactiveDays === d ? "bg-brand text-white" : "bg-gray-100 text-gray-600"}`}>{d}d+</button>
            ))}
          </div>
        </div>
        <CardBody>
          {!inactive ? (
            <Skeleton className="h-32 w-full" />
          ) : inactive.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Ningún cliente lleva {inactiveDays}+ días sin comprar. 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 font-medium">Celular</th>
                    <th className="pb-2 font-medium">Zona</th>
                    <th className="pb-2 text-right font-medium">Pedidos</th>
                    <th className="pb-2 text-right font-medium">Gasto histórico</th>
                    <th className="pb-2 text-right font-medium">Sin comprar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inactive.rows.slice(0, 15).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-medium">{r.name}{r.code && <span className="ml-2 font-mono text-[10px] text-gray-400">{r.code}</span>}</td>
                      <td className="py-2 text-gray-500">{r.phone ?? "—"}</td>
                      <td className="py-2">{r.zone ? <Badge tone="gray">{zoneLabel[r.zone] ?? r.zone}</Badge> : <span className="text-gray-300">—</span>}</td>
                      <td className="py-2 text-right tabular-nums">{r.orderCount}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{money(r.totalSpent)}</td>
                      <td className="py-2 text-right"><Badge tone={r.daysSinceLast >= 90 ? "red" : "amber"}>{r.daysSinceLast} días</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inactive.rows.length > 15 && <p className="mt-2 text-center text-xs text-gray-400">y {inactive.rows.length - 15} más…</p>}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, accent, delta }: { label: string; value: string; sub?: string; accent?: boolean; delta?: { pct: number; hasPrev: boolean } | null }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-brand/30 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
        {delta && (
          delta.hasPrev
            ? <span className={`text-[11px] font-semibold ${delta.pct >= 0 ? "text-green-600" : "text-red-600"}`}>{delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct * 100).toFixed(1)}%</span>
            : <span className="text-[11px] font-semibold text-green-600">nuevo</span>
        )}
      </div>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

function TopCard({ title, icon, rows, onSelect, selectedKey }: { title: string; icon: ReactNode; rows?: TopSellers["rows"]; onSelect?: (row: { id: string; name: string }) => void; selectedKey?: string }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => Number(r.units)));
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">{icon}<span className="text-sm font-semibold">{title}</span>{onSelect && <span className="ml-auto text-[10px] text-gray-400">clic para ver sabores</span>}</div>
      <CardBody className="space-y-2">
        {!rows ? <Skeleton className="h-32 w-full" /> : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin ventas en el rango.</p>
        ) : rows.map((r) => {
          const inner = (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate pr-2 font-medium">{r.label}{r.sublabel && <span className="ml-1 text-xs text-gray-400">· {r.sublabel}</span>}</span>
                <span className="shrink-0 tabular-nums">{r.units} u.{Number(r.returnedUnits) > 0 && <Badge tone="amber">−{r.returnedUnits}</Badge>}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${(Number(r.units) / max) * 100}%` }} />
              </div>
            </>
          );
          return onSelect ? (
            <button key={r.key} type="button" onClick={() => onSelect({ id: r.key, name: r.label })}
              className={`w-full rounded-md p-1 text-left transition-colors hover:bg-gray-50 ${selectedKey === r.key ? "bg-brand/5 ring-1 ring-brand/30" : ""}`}>
              {inner}
            </button>
          ) : <div key={r.key}>{inner}</div>;
        })}
      </CardBody>
    </Card>
  );
}
