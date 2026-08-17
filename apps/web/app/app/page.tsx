"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Award, Boxes, ClipboardCheck, Droplet, Package, PackageX, ScanLine, Truck, UserSquare, UserX, Wallet,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@24hits/contracts";
import type { InactiveCustomers, InventoryBalanceRow, Order, SalesSummary, TopSellers } from "@/lib/catalog-types";
import { hasPermission, useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { money, pct } from "@/lib/format";

// Fecha local YYYY-MM-DD (el backend la interpreta en la zona del negocio).
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Variación vs. ayer (▲/▼). null si no hay con qué comparar.
function deltaOf(cur?: string | number | null, prev?: string | number | null): { pct: number; hasPrev: boolean } | null {
  if (cur == null || prev == null) return null;
  const c = Number(cur), p = Number(prev);
  if (p === 0) return c > 0 ? { pct: 0, hasPrev: false } : null;
  return { pct: (c - p) / p, hasPrev: true };
}

interface Action { href: string; label: string; desc: string; icon: LucideIcon; perm?: PermissionKey }
const actions: Action[] = [
  { href: "/app/sales/pos", label: "Punto de venta", desc: "Escanea y cobra", icon: ScanLine, perm: "orders.create" },
  { href: "/app/sales/orders", label: "Pedidos", desc: "Gestiona y entrega", icon: ClipboardCheck, perm: "orders.read" },
  { href: "/app/sales/customers", label: "Clientes", desc: "Registro y análisis", icon: UserSquare, perm: "customers.read" },
  { href: "/app/inventory", label: "Inventario", desc: "Existencias", icon: Boxes, perm: "inventory.read" },
  { href: "/app/catalog/products", label: "Catálogo", desc: "Productos y precios", icon: Package, perm: "products.read" },
];

export default function AppHomePage() {
  const { data: me, isLoading } = useMe();
  const can = (p: PermissionKey) => isLoading || hasPermission(me, p);
  const visible = actions.filter((a) => !a.perm || can(a.perm));

  const showKpis = hasPermission(me, "reports.read");
  const canOrders = hasPermission(me, "orders.read");
  const canInv = hasPermission(me, "inventory.read");
  const canCust = hasPermission(me, "customers.read");

  const today = isoLocal(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yesterday = isoLocal(y);

  const { data: todaySales } = useQuery({ queryKey: ["home-today", today], enabled: showKpis, queryFn: () => api.get<SalesSummary>(`/reports/sales?from=${today}&to=${today}`).catch(() => null) });
  const { data: ydaySales } = useQuery({ queryKey: ["home-yday", yesterday], enabled: showKpis, queryFn: () => api.get<SalesSummary>(`/reports/sales?from=${yesterday}&to=${yesterday}`).catch(() => null) });
  const { data: topModels } = useQuery({ queryKey: ["home-top-models", today], enabled: showKpis, queryFn: () => api.get<TopSellers>(`/reports/top-sellers?from=${today}&to=${today}&dimension=product&limit=3`).catch(() => null) });
  const { data: topFlavors } = useQuery({ queryKey: ["home-top-flavors", today], enabled: showKpis, queryFn: () => api.get<TopSellers>(`/reports/top-sellers?from=${today}&to=${today}&dimension=flavor&limit=3`).catch(() => null) });
  const { data: orders } = useQuery({ queryKey: ["home-orders"], enabled: canOrders, queryFn: () => api.get<Order[]>("/orders").catch(() => [] as Order[]) });
  const { data: lowStock } = useQuery({ queryKey: ["home-low"], enabled: canInv, queryFn: () => api.get<InventoryBalanceRow[]>("/inventory?lowStock=true").catch(() => [] as InventoryBalanceRow[]) });
  const { data: inactive } = useQuery({ queryKey: ["home-inactive"], enabled: canCust, queryFn: () => api.get<InactiveCustomers>("/customers/inactive?days=30").catch(() => null) });

  const hasProfit = todaySales?.grossProfit != null;
  const pendingDeliveries = (orders ?? []).filter((o) => o.deliveryStatus === "PENDING" || o.deliveryStatus === "DISPATCHED").length;
  const unpaid = (orders ?? []).filter((o) => o.status !== "CANCELLED" && o.paymentStatus !== "PAID").length;

  const firstName = (me?.user?.name ?? me?.user?.email ?? "").split(/[@ ]/)[0];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hola{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="text-sm text-gray-500">{me?.activeOrganization?.name ?? "Tu organización"} · Resumen del día</p>
      </div>

      {/* KPIs de hoy con comparativo vs. ayer */}
      {showKpis && (
        <section className="mb-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Ventas hoy" value={money(todaySales?.billed ?? "0")} delta={deltaOf(todaySales?.billed, ydaySales?.billed)} />
            <Kpi label="Cobrado hoy" value={money(todaySales?.collected ?? "0")} delta={deltaOf(todaySales?.collected, ydaySales?.collected)} />
            <Kpi label="Pedidos hoy" value={String(todaySales?.orderCount ?? 0)} delta={deltaOf(todaySales?.orderCount, ydaySales?.orderCount)} />
            {hasProfit
              ? <Kpi label="Utilidad hoy" value={money(todaySales?.grossProfit)} sub={`margen ${pct(todaySales?.margin)}`} delta={deltaOf(todaySales?.grossProfit, ydaySales?.grossProfit)} accent />
              : <Kpi label="Ticket prom." value={money(todaySales?.avgTicket ?? "0")} />}
            <Kpi label="Por cobrar hoy" value={money(todaySales?.outstanding ?? "0")} />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">▲▼ comparado con ayer</p>
        </section>
      )}

      {/* Requiere atención hoy (accionable) */}
      {(canOrders || canInv || canCust) && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Requiere atención</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {canOrders && <Attn href="/app/sales/orders" icon={Truck} label="Entregas pendientes" count={pendingDeliveries} />}
            {canOrders && <Attn href="/app/sales/orders" icon={Wallet} label="Pedidos por cobrar" count={unpaid} />}
            {canInv && <Attn href="/app/inventory" icon={PackageX} label="Productos con stock bajo" count={lowStock?.length ?? 0} />}
            {canCust && <Attn href="/app/reports" icon={UserX} label="Clientes inactivos (30d+)" count={inactive?.count ?? 0} />}
          </div>
        </section>
      )}

      {/* Más vendido hoy (qué empujar) */}
      {showKpis && (
        <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TopMini title="Modelos más vendidos hoy" icon={Award} rows={topModels?.rows} />
          <TopMini title="Sabores más vendidos hoy" icon={Droplet} rows={topFlavors?.rows} />
        </section>
      )}

      {/* Accesos rápidos */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Accesos rápidos</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href}
              className="group flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand/40 hover:bg-brand/5">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">{a.label}</span>
                <span className="block text-xs text-gray-500">{a.desc}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent, delta }: { label: string; value: string; sub?: string; accent?: boolean; delta?: { pct: number; hasPrev: boolean } | null }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-brand/30 bg-brand/5" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-xl font-bold tabular-nums text-gray-900">{value}</p>
        {delta && (
          delta.hasPrev
            ? <span className={`text-[11px] font-semibold ${delta.pct >= 0 ? "text-green-600" : "text-red-600"}`}>{delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct * 100).toFixed(0)}%</span>
            : <span className="text-[11px] font-semibold text-green-600">nuevo</span>
        )}
      </div>
      {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
    </div>
  );
}

// Tarjeta accionable: un número que exige atención + enlace a resolverlo.
function Attn({ href, icon: Icon, label, count }: { href: string; icon: LucideIcon; label: string; count: number }) {
  const alert = count > 0;
  return (
    <Link href={href} className={`flex items-center gap-3 rounded-xl border p-4 transition-colors ${alert ? "border-amber-200 bg-amber-50 hover:border-amber-300" : "border-gray-200 bg-white hover:border-gray-300"}`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${alert ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}>
        {alert ? <AlertTriangle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold tabular-nums text-gray-900">{count}</span>
        <span className="block truncate text-xs text-gray-500">{label}</span>
      </span>
    </Link>
  );
}

function TopMini({ title, icon: Icon, rows }: { title: string; icon: LucideIcon; rows?: TopSellers["rows"] }) {
  const top = rows ?? [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400"><Icon className="h-4 w-4" /> {title}</p>
      {top.length === 0 ? (
        <p className="py-3 text-center text-sm text-gray-400">Sin ventas hoy.</p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((r, i) => (
            <li key={r.key} className="flex items-center justify-between text-sm">
              <span className="truncate pr-2"><span className="mr-2 text-xs font-bold text-gray-400">{i + 1}</span>{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-600">{r.units} u.</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
