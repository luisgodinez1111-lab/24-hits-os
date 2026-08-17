"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import {
  Badge, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { ProfitByProductRow, SalesSummary } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { money, pct } from "@/lib/format";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));

  const range = { from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` };
  const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

  const { data: summary, isLoading } = useQuery({
    queryKey: ["report-sales", from, to],
    queryFn: () => api.get<SalesSummary>(`/reports/sales?${qs}`),
  });
  // profit-by-product requiere profits.read; si no, el endpoint responde 403 → lista vacía.
  const { data: byProduct } = useQuery({
    queryKey: ["report-profit", from, to],
    queryFn: () => api.get<ProfitByProductRow[]>(`/reports/profit-by-product?${qs}`).catch(() => [] as ProfitByProductRow[]),
  });

  const showProfit = summary?.grossProfit != null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes financieros</h1>
          <p className="text-sm text-gray-500">Ventas, cobros y utilidad — derivado de los ledgers</p>
        </div>
        <div className="flex items-end gap-2">
          <FormField label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !summary ? (
        <EmptyState icon={<TrendingUp className="h-8 w-8 text-gray-400" />} title="Sin datos en el rango" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Facturado" value={money(summary.billed)} />
            <Kpi label="Cobrado" value={money(summary.collected)} />
            <Kpi label="Por cobrar" value={money(summary.outstanding)} />
            <Kpi label="Pedidos" value={String(summary.orderCount)} sub={`Ticket prom. ${money(summary.avgTicket)}`} />
            {showProfit && <Kpi label="Ingreso neto" value={money(summary.revenueNet)} />}
            {showProfit && <Kpi label="Costo (COGS)" value={money(summary.cogs)} />}
            {showProfit && <Kpi label="Utilidad bruta" value={money(summary.grossProfit)} accent />}
            {showProfit && <Kpi label="Margen" value={pct(summary.margin)} accent />}
          </div>

          <div className="mb-8">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Cobros por método</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi label="Efectivo" value={money(summary.byPaymentMethod.CASH)} />
              <Kpi label="Tarjeta" value={money(summary.byPaymentMethod.CARD)} />
              <Kpi label="Transferencia" value={money(summary.byPaymentMethod.TRANSFER)} />
              <Kpi label="Otro" value={money(summary.byPaymentMethod.OTHER)} />
            </div>
          </div>

          {showProfit && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Utilidad por producto</h2>
              {!byProduct || byProduct.length === 0 ? (
                <EmptyState icon={<TrendingUp className="h-8 w-8 text-gray-400" />} title="Sin ventas entregadas en el rango" />
              ) : (
                <Table>
                  <THead><TR><TH>Producto</TH><TH>SKU</TH><TH className="text-right">Unidades</TH><TH className="text-right">Ingreso</TH><TH className="text-right">Costo</TH><TH className="text-right">Utilidad</TH><TH className="text-right">Margen</TH></TR></THead>
                  <TBody>
                    {byProduct.map((r) => (
                      <TR key={r.variantId}>
                        <TD className="font-medium">{r.name ?? r.variantId.slice(0, 8)}</TD>
                        <TD className="font-mono text-xs text-gray-500">{r.sku ?? "—"}</TD>
                        <TD className="text-right">{Number(r.quantity)}</TD>
                        <TD className="text-right">{money(r.revenue)}</TD>
                        <TD className="text-right text-gray-500">{money(r.cogs)}</TD>
                        <TD className="text-right font-semibold">{money(r.grossProfit)}</TD>
                        <TD className="text-right"><Badge tone={Number(r.margin) >= 0.3 ? "green" : Number(r.margin) >= 0.1 ? "amber" : "red"}>{pct(r.margin)}</Badge></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-brand/30 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
