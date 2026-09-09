import {
  Boxes,
  ClipboardCheck,
  Home,
  Package,
  Radar,
  Route,
  Settings,
  ShoppingCart,
  TrendingUp,
  UserSquare,
  Wallet,
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

// Navegación por OPERACIÓN, no por módulo técnico: agrupa por la tarea que estás
// haciendo (operar el día → atender clientes → abastecer → analizar → administrar),
// para que el flujo diario viva junto y haya menos que escanear.
export const navSections: NavSection[] = [
  {
    title: "Operar",
    items: [
      { href: "/app", label: "Inicio", icon: Home, exact: true },
      { href: "/app/sales/orders", label: "Pedidos", icon: ClipboardCheck, perm: "orders.read" },
      { href: "/app/sales/route", label: "Ruta de hoy", icon: Route, perm: "orders.read" },
      { href: "/app/sales/tracking", label: "Seguimiento", icon: Radar, perm: "orders.read" },
      { href: "/app/sales/cash", label: "Caja", icon: Wallet, perm: "cash.read" },
    ],
  },
  {
    title: "Clientes",
    items: [{ href: "/app/sales/customers", label: "Clientes", icon: UserSquare, perm: "customers.read" }],
  },
  {
    title: "Abastecer",
    items: [
      { href: "/app/inventory", label: "Existencias", icon: Boxes, exact: true, perm: "inventory.read" },
      { href: "/app/purchasing", label: "Compras", icon: ShoppingCart, perm: "suppliers.read" },
      { href: "/app/catalog", label: "Catálogo", icon: Package, perm: "products.read" },
    ],
  },
  {
    title: "Analizar",
    items: [{ href: "/app/reports", label: "Reportes", icon: TrendingUp, perm: "reports.read" }],
  },
  {
    title: "Administrar",
    items: [{ href: "/app/settings", label: "Configuración", icon: Settings }],
  },
];

// Barra inferior SOLO en móvil (cajero en tablet, repartidor en celular): atajo a las
// 4 acciones del día. El resto del menú vive en el cajón (☰). Etiquetas cortas a
// propósito. Se filtra por permiso, así que cada rol ve solo lo suyo.
export const bottomNavItems: NavItem[] = [
  { href: "/app", label: "Inicio", icon: Home, exact: true },
  { href: "/app/sales/orders", label: "Pedidos", icon: ClipboardCheck, perm: "orders.read" },
  { href: "/app/sales/route", label: "Ruta", icon: Route, perm: "orders.read" },
  { href: "/app/sales/cash", label: "Caja", icon: Wallet, perm: "cash.read" },
];
