import { ClipboardCheck, Receipt, Route, Undo2, UserSquare, Wallet } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Ventas. (Punto de venta / mostrador se ocultó: el
// negocio es 100% pedidos a domicilio; se crea desde "Pedidos → Nuevo".)
export const salesTabs: SectionTab[] = [
  { href: "/app/sales/orders", label: "Pedidos", icon: ClipboardCheck, perm: "orders.read" },
  { href: "/app/sales/route", label: "Ruta de hoy", icon: Route, perm: "orders.read" },
  { href: "/app/sales/cash", label: "Caja", icon: Wallet, perm: "cash.read" },
  { href: "/app/sales/notes", label: "Notas de venta", icon: Receipt, perm: "sales.note.read" },
  { href: "/app/sales/credit-notes", label: "Notas de crédito", icon: Undo2, perm: "sales.credit.read" },
  { href: "/app/sales/customers", label: "Clientes", icon: UserSquare, perm: "customers.read" },
];
