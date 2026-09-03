import {
  Boxes,
  ClipboardCheck,
  Home,
  Package,
  Radar,
  Route,
  ScanLine,
  Settings,
  ShoppingCart,
  TrendingUp,
  UserSquare,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@24hits/contracts";

// Navegación de la app. Fuente única compartida por el Sidebar y el Command palette (⌘K).
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  perm?: PermissionKey; // si falta el permiso, el ítem se oculta
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

// Orden por flujo de trabajo: operación (ventas/caja) → abastecimiento (inventario/
// compras/catálogo) → análisis (reportes) → administración.
export const navSections: NavSection[] = [
  {
    title: "General",
    items: [{ href: "/app", label: "Inicio", icon: Home, exact: true }],
  },
  {
    title: "Ventas",
    items: [
      { href: "/app/sales/pos", label: "Punto de venta", icon: ScanLine, perm: "orders.create" },
      { href: "/app/sales/orders", label: "Pedidos", icon: ClipboardCheck, perm: "orders.read" },
      { href: "/app/sales/route", label: "Ruta de hoy", icon: Route, perm: "orders.read" },
      { href: "/app/sales/tracking", label: "Seguimiento", icon: Radar, perm: "orders.read" },
      { href: "/app/sales/customers", label: "Clientes", icon: UserSquare, perm: "customers.read" },
    ],
  },
  {
    title: "Inventario",
    items: [{ href: "/app/inventory", label: "Existencias", icon: Boxes, exact: true, perm: "inventory.read" }],
  },
  {
    title: "Compras",
    items: [{ href: "/app/purchasing", label: "Compras", icon: ShoppingCart, perm: "suppliers.read" }],
  },
  {
    title: "Catálogo",
    items: [{ href: "/app/catalog", label: "Catálogo", icon: Package, perm: "products.read" }],
  },
  {
    title: "Reportes",
    items: [{ href: "/app/reports", label: "Reportes", icon: TrendingUp, perm: "reports.read" }],
  },
  {
    title: "Administración",
    items: [{ href: "/app/settings", label: "Configuración", icon: Settings }],
  },
];
