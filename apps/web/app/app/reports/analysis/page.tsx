"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import {
  Badge, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { TopSellers } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { money, pct } from "@/lib/format";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

const dimensions = [
  { key: "product", label: "Modelos" },
  { key: "brand", label: "Marcas" },
  { key: "flavor", label: "Sabores" },
] as const;
const sorts = [
  { key: "units", label: "Más vendidos" },
  { key: "returns", label: "Más devueltos" },
] as const;

export default function AnalysisPage() {
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [dimension, setDimension] = useState<(typeof dimensions)[number]["key"]>("product");
  const [sort, setSort] = useState<(typeof sorts)[number]["key"]>("units");

  const qs = new URLSearchParams({
    dimension, sort,
    from: `${from}T00:00:00.000Z`,
    to: `${to}T23:59:59.999Z`,
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["top-sellers", dimension, sort, from, to],
    queryFn: () => api.get<TopSellers>(`/reports/top-sellers?${qs}`),
  });

  const showProfit = (data?.rows ?? []).some((r) => r.grossProfit != null);
  const colName = dimension === "brand" ? "Marca" : dimension === "flavor" ? "Sabor" : "Modelo";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Más vendidos</h1>
          <p className="text-sm text-gray-500">Qué se vende y qué se devuelve — por modelo, marca o sabor</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented options={dimensions} value={dimension} onChange={setDimension} />
        <span className="mx-1 h-5 w-px bg-gray-200" />
        <Segmented options={sorts} value={sort} onChange={setSort} />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-8 w-8 text-gray-400" />} title="Sin ventas en el rango" description="Ajusta las fechas o registra ventas." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-8">#</TH>
              <TH>{colName}</TH>
              <TH className="text-right">Unidades</TH>
              <TH className="text-right">Ingreso</TH>
              {showProfit && <TH className="text-right">Utilidad</TH>}
              {showProfit && <TH className="text-right">Margen</TH>}
              <TH className="text-right">Devueltas</TH>
              <TH className="text-right">% Devol.</TH>
            </TR>
          </THead>
          <TBody>
            {data.rows.map((r, i) => (
              <TR key={r.key}>
                <TD className="text-gray-400">{i + 1}</TD>
                <TD>
                  <span className="font-medium">{r.label}</span>
                  {r.sublabel && <span className="ml-2 text-xs text-gray-400">{r.sublabel}</span>}
                </TD>
                <TD className="text-right font-semibold tabular-nums">{Number(r.units).toLocaleString("es-MX")}</TD>
                <TD className="text-right tabular-nums">{money(r.revenue)}</TD>
                {showProfit && <TD className="text-right tabular-nums">{money(r.grossProfit)}</TD>}
                {showProfit && <TD className="text-right tabular-nums text-gray-500">{pct(r.margin)}</TD>}
                <TD className="text-right tabular-nums">{Number(r.returnedUnits) > 0 ? <span className="text-red-600">{Number(r.returnedUnits)}</span> : "—"}</TD>
                <TD className="text-right">
                  {Number(r.returnedUnits) > 0
                    ? <Badge tone={Number(r.returnRate) >= 0.2 ? "red" : Number(r.returnRate) >= 0.1 ? "amber" : "gray"}>{pct(r.returnRate)}</Badge>
                    : <span className="text-gray-300">0%</span>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${value === o.key ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
