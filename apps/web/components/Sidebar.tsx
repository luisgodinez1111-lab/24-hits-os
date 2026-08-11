"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Contact,
  DollarSign,
  Droplet,
  FolderTree,
  Home,
  Layers,
  MapPin,
  Monitor,
  Package,
  ScrollText,
  Shield,
  ShoppingCart,
  Tag,
  Users,
  UserSquare,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@24hits/ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}
interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "General",
    items: [{ href: "/app", label: "Inicio", icon: Home, exact: true }],
  },
  {
    title: "Catálogo",
    items: [
      { href: "/app/catalog/products", label: "Productos", icon: Package },
      { href: "/app/catalog/brands", label: "Marcas", icon: Tag },
      { href: "/app/catalog/categories", label: "Categorías", icon: FolderTree },
      { href: "/app/catalog/flavors", label: "Sabores", icon: Droplet },
      { href: "/app/catalog/pricing", label: "Precios", icon: DollarSign },
    ],
  },
  {
    title: "Inventario",
    items: [
      { href: "/app/inventory", label: "Existencias", icon: Boxes, exact: true },
      { href: "/app/inventory/movements", label: "Movimientos", icon: ArrowLeftRight },
      { href: "/app/inventory/transfers", label: "Transferencias", icon: ArrowLeftRight },
      { href: "/app/inventory/counts", label: "Conteos", icon: ClipboardList },
    ],
  },
  {
    title: "Compras",
    items: [
      { href: "/app/purchasing/suppliers", label: "Proveedores", icon: Contact },
      { href: "/app/purchasing/orders", label: "Órdenes de compra", icon: ShoppingCart },
    ],
  },
  {
    title: "Ventas",
    items: [
      { href: "/app/sales/customers", label: "Clientes", icon: UserSquare },
      { href: "/app/sales/orders", label: "Pedidos", icon: ClipboardCheck },
    ],
  },
  {
    title: "Caja",
    items: [
      { href: "/app/cash/sessions", label: "Turnos de caja", icon: Wallet },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/app/settings/organization", label: "Organización", icon: Building2 },
      { href: "/app/settings/branches", label: "Sucursales", icon: MapPin },
      { href: "/app/settings/warehouses", label: "Almacenes", icon: Warehouse },
      { href: "/app/settings/users", label: "Usuarios", icon: Users },
      { href: "/app/settings/roles", label: "Roles", icon: Shield },
      { href: "/app/settings/audit", label: "Auditoría", icon: ScrollText },
      { href: "/app/settings/sessions", label: "Sesiones", icon: Monitor },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
          <Layers className="h-4 w-4" />
        </span>
        <span className="font-bold text-gray-900">24 HITS OS</span>
      </div>
      <nav className="flex-1 space-y-4 p-3">
        {sections.map((section) => (
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
      <div className="border-t border-gray-200 p-4 text-xs text-gray-400">v0.2.0</div>
    </aside>
  );
}
