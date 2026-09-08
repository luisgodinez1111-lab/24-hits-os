"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Wallet } from "lucide-react";
import {
  Badge, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR,
} from "@24hits/ui";
import type { CustomerAccount, CustomerInsights, CustomerZone } from "@/lib/catalog-types";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

const zoneLabel: Record<CustomerZone, string> = { NORTE: "Norte", SUR: "Sur", ESTE: "Este", OESTE: "Oeste", CENTRO: "Centro" };
const zoneTone: Record<CustomerZone, "blue" | "green" | "amber" | "gray" | "red"> = {
  NORTE: "blue", SUR: "green", ESTE: "amber", OESTE: "red", CENTRO: "gray",
};
const freq = (d: number | null) =>
  d == null ? "—" : d < 1 ? "varias veces al día" : d < 45 ? `cada ${d} días` : `cada ${Math.round(d / 30)} meses`;

// Ficha del cliente: perfil + estado de cuenta + hábitos de compra, en una página
// deep-linkable (se llega desde Clientes y desde Pedidos). Reúne lo que antes solo
// vivía en diálogos: reutiliza /customers/:id/insights y /customers/:id/account.
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: insights, isLoading: li } = useQuery({
    queryKey: ["customer-insights", id],
    queryFn: () => api.get<CustomerInsights>(`/customers/${id}/insights`),
  });
  const { data: account, isLoading: la } = useQuery({
    queryKey: ["customer-account", id],
    queryFn: () => api.get<CustomerAccount>(`/customers/${id}/account`),
  });

  const c = insights?.customer;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/app/sales/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      {li ? (
        <Skeleton className="mb-6 h-16 w-full" />
      ) : !c ? (
        <EmptyState icon={<BarChart3 className="h-8 w-8 text-gray-400" />} title="Cliente no encontrado" description="Puede haber sido eliminado o no tienes acceso." />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-title text-gray-900">{c.name}</h1>
                {c.code && <span className="font-mono text-xs text-gray-400">{c.code}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <Badge tone={c.status === "ACTIVE" ? "green" : "gray"}>{c.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge>
                <Badge tone="gray">{c.type === "WHOLESALE" ? "Mayoreo" : "Menudeo"}</Badge>
                {c.zone && <Badge tone={zoneTone[c.zone]}>{zoneLabel[c.zone]}</Badge>}
                {c.phone && <a href={`tel:${c.phone}`} className="text-brand hover:underline">{c.phone}</a>}
                {c.address && <span className="text-gray-400">· {c.address}</span>}
              </div>
            </div>
          </div>

          {/* Estado de cuenta */}
          <section className="mb-6">
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400"><Wallet className="h-4 w-4" /> Estado de cuenta</h2>
            {la || !account ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Comprado" value={money(account.summary.charges)} />
                <Stat label="Pagado" value={money(account.summary.paid)} />
                <Stat label="Devuelto" value={money(account.summary.credited)} />
                <Stat label="Crédito a favor" value={money(account.summary.creditInFavor)} />
                <Stat label="Saldo" value={money(account.summary.balance)} accent />
                {account.creditLimit != null && <Stat label="Crédito disp." value={money(account.creditAvailable)} />}
              </div>
            )}
          </section>

          {/* Hábitos de compra */}
          {insights && (
            <section className="mb-6">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400"><BarChart3 className="h-4 w-4" /> Hábitos de compra</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Pedidos" value={String(insights.summary.orderCount)} />
                <Stat label="Total comprado" value={money(insights.summary.totalSpent)} />
                <Stat label="Ticket prom." value={money(insights.summary.avgTicket)} />
                <Stat label="Frecuencia" value={freq(insights.summary.avgDaysBetween)} />
                <Stat label="Última compra" value={insights.summary.daysSinceLast == null ? "—" : `hace ${insights.summary.daysSinceLast} d`} accent />
                <Stat label="Cliente desde" value={insights.summary.firstOrderAt ? new Date(insights.summary.firstOrderAt).toLocaleDateString("es-MX") : "—"} />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TopList title="Sabores favoritos" rows={insights.topFlavors} />
                <TopList title="Modelos favoritos" rows={insights.topModels} />
                <TopList title="Marcas favoritas" rows={insights.topBrands} />
              </div>
            </section>
          )}

          {/* Pedidos */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Pedidos {account ? `(${account.orders.length})` : ""}</h2>
            {la || !account ? (
              <Skeleton className="h-40 w-full" />
            ) : account.orders.length === 0 ? (
              <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-400">Sin pedidos todavía.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <THead><TR><TH>Folio</TH><TH>Fecha</TH><TH>Estado</TH><TH>Pago</TH><TH className="text-right">Total</TH></TR></THead>
                  <TBody>
                    {account.orders.map((o) => (
                      <TR key={o.id}>
                        <TD className="font-mono text-xs">{o.number}</TD>
                        <TD className="text-gray-500">{new Date(o.date).toLocaleDateString("es-MX")}</TD>
                        <TD><Badge tone={o.status === "COMPLETED" || o.status === "FULFILLED" ? "green" : o.status === "CANCELLED" ? "red" : "gray"}>{o.status}</Badge></TD>
                        <TD><Badge tone={o.paymentStatus === "PAID" ? "green" : o.paymentStatus === "PARTIAL" ? "amber" : "gray"}>{o.paymentStatus}</Badge></TD>
                        <TD className="text-right font-mono tabular-nums">{money(o.total)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-brand/30 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: Array<{ label: string; units: string }> }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      {rows.length === 0 ? <p className="text-sm text-gray-400">Sin datos.</p> : (
        <ul className="space-y-1">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-1 text-sm">
              <span className="truncate pr-2">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-600">{r.units}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
