"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes, ClipboardCheck, DollarSign, Package, ScanLine, Wallet, BookText,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@24hits/contracts";
import type { SalesSummary } from "@/lib/catalog-types";
import { hasPermission, useMe } from "@/lib/me";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

interface Action { href: string; label: string; desc: string; icon: LucideIcon; perm?: PermissionKey }
const actions: Action[] = [
  { href: "/app/sales/pos", label: "Punto de venta", desc: "Escanea y cobra", icon: ScanLine, perm: "orders.create" },
  { href: "/app/sales/orders", label: "Pedidos", desc: "Gestiona ventas", icon: ClipboardCheck, perm: "orders.read" },
  { href: "/app/cash/sessions", label: "Turnos de caja", desc: "Abre y cierra caja", icon: Wallet, perm: "cash.read" },
  { href: "/app/reports/register", label: "Registro de ventas", desc: "Diario de ventas", icon: BookText, perm: "reports.read" },
  { href: "/app/inventory", label: "Inventario", desc: "Existencias", icon: Boxes, perm: "inventory.read" },
  { href: "/app/catalog/products", label: "Catálogo", desc: "Productos y precios", icon: Package, perm: "products.read" },
];

export default function AppHomePage() {
  const { data: me, isLoading } = useMe();
  const canSee = (a: Action) => !a.perm || isLoading || hasPermission(me, a.perm);
  const visible = actions.filter(canSee);

  // KPIs de hoy (solo si puede ver reportes).
  const showKpis = hasPermission(me, "reports.read");
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const qs = `from=${encodeURIComponent(todayStart.toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`;
  const { data: today } = useQuery({
    queryKey: ["home-today"], enabled: showKpis,
    queryFn: () => api.get<SalesSummary>(`/reports/sales?${qs}`).catch(() => null),
  });

  const firstName = (me?.user?.name ?? me?.user?.email ?? "").split(/[@ ]/)[0];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Hola{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="text-sm text-gray-500">{me?.activeOrganization?.name ?? "Tu organización"}</p>
      </div>

      {showKpis && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <Kpi label="Ventas hoy" value={money(today?.billed ?? "0")} />
          <Kpi label="Cobrado hoy" value={money(today?.collected ?? "0")} />
          <Kpi label="Tickets" value={String(today?.orderCount ?? 0)} icon={DollarSign} />
        </div>
      )}

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

function Kpi({ label, value }: { label: string; value: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
