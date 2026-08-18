import { ClipboardCheck, Receipt, Route, ScanLine, Undo2, UserSquare } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Ventas.
export const salesTabs: SectionTab[] = [
  { href: "/app/sales/pos", label: "Punto de venta", icon: ScanLine, perm: "orders.create" },
  { href: "/app/sales/orders", label: "Pedidos", icon: ClipboardCheck, perm: "orders.read" },
  { href: "/app/sales/route", label: "Ruta de hoy", icon: Route, perm: "orders.read" },
  { href: "/app/sales/notes", label: "Notas de venta", icon: Receipt, perm: "sales.note.read" },
  { href: "/app/sales/credit-notes", label: "Notas de crédito", icon: Undo2, perm: "sales.credit.read" },
  { href: "/app/sales/customers", label: "Clientes", icon: UserSquare, perm: "customers.read" },
];
