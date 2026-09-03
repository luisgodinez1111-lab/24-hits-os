"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import {
  Badge, EmptyState, ErrorState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { ProfitByProductRow, SalesSummary } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { money, pct } from "@/lib/format";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

interface Receivables {
  total: string;
  orderCount: number;
  aging: { d0_30: string; d31_60: string; d61_90: string; d90plus: string };
  topDebtors: { customerId: string; name: string; amount: string }[];
}

interface InventoryValue { value: string; currency: string }
interface SlowMovers {
  days: number;
  trappedTotal: string;
  items: { variantId: string; name: string; sku: string | null; onHand: string; value: string }[];
}

export default function ReportsPage() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));

  const range = { from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` };
  const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;

  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ["report-sales", from, to],
    queryFn: () => api.get<SalesSummary>(`/reports/sales?${qs}`),
  });
  // profit-by-product requiere profits.read; si no, el endpoint responde 403 → lista vacía.
  const { data: byProduct } = useQuery({
    queryKey: ["report-profit", from, to],
    queryFn: () => api.get<ProfitByProductRow[]>(`/reports/profit-by-product?${qs}`).catch(() => [] as ProfitByProductRow[]),
  });
  // Cuentas por cobrar: foto al momento, independiente del rango de fechas.
  const { data: receivables } = useQuery({
    queryKey: ["report-receivables"],
    queryFn: () => api.get<Receivables>("/reports/receivables").catch(() => null),
  });
  // Inventario (requiere costs.read; si no, 403 → null y no se muestra).
  const { data: invValue } = useQuery({
    queryKey: ["report-inv-value"],
    queryFn: () => api.get<InventoryValue>("/inventory/value").catch(() => null),
  });
  const { data: slowMovers } = useQuery({
    queryKey: ["report-slow-movers"],
    queryFn: () => api.get<SlowMovers>("/inventory/slow-movers").catch(() => null),
  });

  const showProfit = summary?.grossProfit != null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-title text-gray-900">Reportes financieros</h1>
          <p className="text-sm text-gray-500">Ventas, cobros y utilidad — derivado de los ledgers</p>
        </div>
        <div className="flex items-end gap-2">
          <FormField label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
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

      {/* CUENTAS POR COBRAR — foto al momento (no depende del rango de arriba). */}
      {receivables && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Cuentas por cobrar <span className="text-gray-400 normal-case">· al momento</span>
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
            <Kpi label="Total por cobrar" value={money(receivables.total)} sub={`${receivables.orderCount} pedido(s)`} accent />
            <Kpi label="0–30 días" value={money(receivables.aging.d0_30)} />
            <Kpi label="31–60 días" value={money(receivables.aging.d31_60)} />
            <Kpi label="61–90 días" value={money(receivables.aging.d61_90)} />
            <Kpi label="90+ días" value={money(receivables.aging.d90plus)} sub={Number(receivables.aging.d90plus) > 0 ? "⚠️ vencido" : undefined} />
          </div>
          {receivables.topDebtors.length > 0 ? (
            <Table>
              <THead><TR><TH>Cliente</TH><TH className="text-right">Debe</TH></TR></THead>
              <TBody>
                {receivables.topDebtors.map((d) => (
                  <TR key={d.customerId}>
                    <TD className="font-medium">{d.name}</TD>
                    <TD className="text-right font-semibold">{money(d.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={<TrendingUp className="h-8 w-8 text-gray-400" />} title="Nadie te debe — todo cobrado" />
          )}
        </div>
      )}

      {/* INVENTARIO — valor y capital atrapado (requiere costs.read). */}
      {(invValue || slowMovers) && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">
            Inventario <span className="text-gray-400 normal-case">· al momento</span>
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
            {invValue && <Kpi label="Valor de inventario" value={money(invValue.value)} accent />}
            {slowMovers && (
              <Kpi
                label={`Capital atrapado (>${slowMovers.days}d sin venta)`}
                value={money(slowMovers.trappedTotal)}
                sub={`${slowMovers.items.length} producto(s) sin rotar`}
              />
            )}
          </div>
          {slowMovers && slowMovers.items.length > 0 && (
            <Table>
              <THead><TR><TH>Producto</TH><TH>SKU</TH><TH className="text-right">Existencias</TH><TH className="text-right">Capital atrapado</TH></TR></THead>
              <TBody>
                {slowMovers.items.map((it) => (
                  <TR key={it.variantId}>
                    <TD className="font-medium">{it.name}</TD>
                    <TD className="font-mono text-xs text-gray-500">{it.sku ?? "—"}</TD>
                    <TD className="text-right tabular-nums">{Number(it.onHand).toLocaleString("es-MX")}</TD>
                    <TD className="text-right font-semibold tabular-nums">{money(it.value)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
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
