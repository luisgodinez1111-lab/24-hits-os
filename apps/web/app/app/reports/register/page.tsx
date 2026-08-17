"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookText } from "lucide-react";
import {
  Badge, EmptyState, FormField, Input, Select, Skeleton,
  Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { SalesRegister } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

const statusTone: Record<string, "gray" | "amber" | "blue" | "green" | "red"> = {
  DRAFT: "gray", CONFIRMED: "blue", PARTIALLY_FULFILLED: "amber",
  FULFILLED: "green", COMPLETED: "green", CANCELLED: "red",
};
const payTone: Record<string, "gray" | "amber" | "green"> = { PENDING: "gray", PARTIAL: "amber", PAID: "green" };
const methodLabel: Record<string, string> = { CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transf.", OTHER: "Otro" };

export default function SalesRegisterPage() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [status, setStatus] = useState("");

  const qs = new URLSearchParams({
    from: `${from}T00:00:00.000Z`,
    to: `${to}T23:59:59.999Z`,
    ...(status ? { status } : {}),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-register", from, to, status],
    queryFn: () => api.get<SalesRegister>(`/reports/sales-register?${qs}`),
  });

  const showProfit = (data?.rows ?? []).some((r) => r.grossProfit != null) || data?.totals.grossProfit != null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Registro de ventas</h1>
          <p className="text-sm text-gray-500">Diario transaccional — cada venta con su pago, nota y costo</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label="Desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormField>
          <FormField label="Hasta"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormField>
          <FormField label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos (menos borrador)</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="FULFILLED">Entregado</option>
              <option value="COMPLETED">Completado</option>
              <option value="CANCELLED">Cancelado</option>
            </Select>
          </FormField>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={<BookText className="h-8 w-8 text-gray-400" />} title="Sin ventas en el rango" description="Ajusta las fechas o registra una venta." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Ventas" value={String(data.totals.count)} />
            <Kpi label="Facturado" value={money(data.totals.billed)} />
            <Kpi label="Cobrado" value={money(data.totals.collected)} />
            <Kpi label="Por cobrar" value={money(data.totals.outstanding)} />
            {showProfit && <Kpi label="Costo (COGS)" value={money(data.totals.cogs)} />}
            {showProfit && <Kpi label="Utilidad bruta" value={money(data.totals.grossProfit)} accent />}
          </div>

          <Table>
              <THead>
                <TR>
                  <TH>Folio</TH><TH>Fecha</TH><TH>Cliente</TH><TH>Estado</TH><TH>Pago</TH>
                  <TH className="text-right">Total</TH><TH className="text-right">Pagado</TH><TH className="text-right">Saldo</TH>
                  <TH className="text-right">Devuelto</TH><TH>Métodos</TH><TH>Nota</TH>
                  {showProfit && <TH className="text-right">Costo</TH>}
                  {showProfit && <TH className="text-right">Utilidad</TH>}
                </TR>
              </THead>
              <TBody>
                {data.rows.map((r) => (
                  <TR key={r.orderId}>
                    <TD className="font-mono text-xs">{r.number}</TD>
                    <TD className="whitespace-nowrap text-gray-500">{new Date(r.date).toLocaleDateString("es-MX")}</TD>
                    <TD className="font-medium">{r.customerName ?? "Mostrador"}</TD>
                    <TD><Badge tone={statusTone[r.status] ?? "gray"}>{r.status}</Badge></TD>
                    <TD><Badge tone={payTone[r.paymentStatus] ?? "gray"}>{r.paymentStatus}</Badge></TD>
                    <TD className="text-right">{money(r.total)}</TD>
                    <TD className="text-right text-gray-500">{money(r.paid)}</TD>
                    <TD className="text-right">{Number(r.balance) > 0 ? <span className="text-amber-600">{money(r.balance)}</span> : money(r.balance)}</TD>
                    <TD className="text-right">{Number(r.credited) > 0 ? <span className="text-red-600">{money(r.credited)}</span> : "—"}</TD>
                    <TD className="text-xs text-gray-500">{r.methods.map((m) => methodLabel[m] ?? m).join(", ") || "—"}</TD>
                    <TD className="font-mono text-xs text-gray-500">{r.saleNoteNumber ?? "—"}</TD>
                    {showProfit && <TD className="text-right text-gray-500">{money(r.cogs)}</TD>}
                    {showProfit && <TD className="text-right font-semibold">{money(r.grossProfit)}</TD>}
                  </TR>
                ))}
              </TBody>
            </Table>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-brand/30 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
