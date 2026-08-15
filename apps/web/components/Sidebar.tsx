"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Contact,
  Home,
  Layers,
  Package,
  Receipt,
  ScanLine,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  Undo2,
  UserSquare,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@24hits/contracts";
import { cn } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  perm?: PermissionKey; // si falta el permiso, el ítem se oculta
}
interface NavSection {
  title: string;
  items: NavItem[];
}

// Orden por flujo de trabajo: operación (ventas/caja) → abastecimiento (inventario/
// compras/catálogo) → análisis (reportes) → administración.
const sections: NavSection[] = [
  {
    title: "General",
    items: [{ href: "/app", label: "Inicio", icon: Home, exact: true }],
  },
  {
    title: "Ventas",
    items: [
      { href: "/app/sales/pos", label: "Punto de venta", icon: ScanLine, perm: "orders.create" },
      { href: "/app/sales/orders", label: "Pedidos", icon: ClipboardCheck, perm: "orders.read" },
      { href: "/app/sales/notes", label: "Notas de venta", icon: Receipt, perm: "sales.note.read" },
      { href: "/app/sales/credit-notes", label: "Notas de crédito", icon: Undo2, perm: "sales.credit.read" },
      { href: "/app/sales/customers", label: "Clientes", icon: UserSquare, perm: "customers.read" },
    ],
  },
  {
    title: "Inventario",
    items: [
      { href: "/app/inventory", label: "Existencias", icon: Boxes, exact: true, perm: "inventory.read" },
      { href: "/app/inventory/movements", label: "Movimientos", icon: ArrowLeftRight, perm: "inventory.movement.read" },
      { href: "/app/inventory/transfers", label: "Transferencias", icon: Truck, perm: "inventory.read" },
      { href: "/app/inventory/counts", label: "Conteos", icon: ClipboardList, perm: "inventory.read" },
    ],
  },
  {
    title: "Compras",
    items: [
      { href: "/app/purchasing/suppliers", label: "Proveedores", icon: Contact, perm: "suppliers.read" },
      { href: "/app/purchasing/orders", label: "Órdenes de compra", icon: ShoppingCart, perm: "purchasing.read" },
    ],
  },
  {
    title: "Catálogo",
    // Productos, marcas, categorías, sabores y precios en una sola ventana con pestañas.
    items: [{ href: "/app/catalog", label: "Catálogo", icon: Package, perm: "products.read" }],
  },
  {
    title: "Reportes",
    // Financieros, más vendidos y registro de ventas en una sola ventana con pestañas.
    items: [{ href: "/app/reports", label: "Reportes", icon: TrendingUp, perm: "reports.read" }],
  },
  {
    title: "Administración",
    // Todo (organización, sucursales, almacenes, usuarios, roles, auditoría,
    // dispositivos) vive dentro de una sola ventana con pestañas.
    items: [{ href: "/app/settings", label: "Configuración", icon: Settings }],
  },
];

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();

  // Un ítem se muestra si no exige permiso, si aún carga /me, o si el usuario lo tiene.
  const canSee = (item: NavItem): boolean => !item.perm || isLoading || hasPermission(me, item.perm);
  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter(canSee) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      {/* Fondo oscuro en móvil cuando el cajón está abierto */}
      {open && <div className="fixed inset-0 z-30 bg-gray-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            <Layers className="h-4 w-4" />
          </span>
          <span className="font-bold text-gray-900">24 HITS OS</span>
        </div>
        <nav className="flex-1 space-y-4 p-3">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((s) => {
                  const active = s.exact ? pathname === s.href : pathname.startsWith(s.href);
                  const Icon = s.icon;
                  return (
                    <Link
                      key={s.href}
                      href={s.href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {s.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-4 text-xs text-gray-400">v0.3.0</div>
      </aside>
    </>
  );
}
