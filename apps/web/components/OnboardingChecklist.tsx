"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Package, ScanLine, UserPlus, type LucideIcon } from "lucide-react";
import { cn } from "@24hits/ui";
import { api } from "@/lib/api";
import type { Customer, Order, ProductPage } from "@/lib/catalog-types";

// Onboarding "Primeros pasos": guía a un negocio recién creado a través de la
// configuración mínima (producto → venta → cliente). Detecta cada paso con datos
// reales y desaparece cuando los tres están completos, así que una org ya en
// marcha NUNCA lo ve. Seguro por diseño: cada señal cae a "pendiente" ante un
// fallo de red en vez de romper el dashboard.
export function OnboardingChecklist({ enabled }: { enabled: boolean }) {
  const { data: products } = useQuery({
    queryKey: ["onb-products"],
    enabled,
    queryFn: () => api.get<ProductPage>("/products?limit=1").catch(() => ({ items: [], nextCursor: null } as ProductPage)),
  });
  const { data: orders } = useQuery({
    queryKey: ["home-orders"],
    enabled,
    queryFn: () => api.get<Order[]>("/orders").catch(() => [] as Order[]),
  });
  const { data: customers } = useQuery({
    queryKey: ["customers"],
    enabled,
    queryFn: () => api.get<Customer[]>("/customers").catch(() => [] as Customer[]),
  });

  if (!enabled) return null;
  // Mientras cargan las señales no mostramos nada (evita el parpadeo del card).
  if (products === undefined || orders === undefined || customers === undefined) return null;

  const steps: { key: string; label: string; desc: string; href: string; icon: LucideIcon; done: boolean }[] = [
    { key: "product", label: "Agrega tu primer producto", desc: "Marca, modelo y sabor con su precio.", href: "/app/catalog/products", icon: Package, done: products.items.length > 0 },
    { key: "sale", label: "Registra tu primera venta", desc: "Escanea un código de barras y cobra.", href: "/app/sales/pos", icon: ScanLine, done: orders.length > 0 },
    { key: "customer", label: "Agrega un cliente", desc: "Para dar seguimiento y crédito.", href: "/app/sales/customers", icon: UserPlus, done: customers.length > 0 },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  // Negocio ya configurado → el onboarding se retira solo.
  if (doneCount === steps.length) return null;

  return (
    <section className="mb-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Primeros pasos</h2>
            <p className="text-sm text-gray-500">Configura tu negocio en {steps.length} pasos.</p>
          </div>
          <span className="font-mono text-sm font-semibold tabular-nums text-gray-500">{doneCount}/{steps.length}</span>
        </div>

        {/* Barra de progreso: se llena con la curva enfática (coherente con el movimiento del sistema). */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-brand transition-all duration-slow ease-emphasized"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>

        <ol className="mt-4 space-y-2">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="group flex items-center gap-3 rounded-xl border border-gray-200 p-3 transition-colors hover:border-brand/40 hover:bg-brand/5"
                >
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", s.done ? "bg-brand text-white" : "bg-gray-100 text-gray-400")}>
                    {s.done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm font-medium", s.done ? "text-gray-400 line-through" : "text-gray-900")}>{s.label}</span>
                    <span className="block truncate text-xs text-gray-500">{s.desc}</span>
                  </span>
                  {!s.done && <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
