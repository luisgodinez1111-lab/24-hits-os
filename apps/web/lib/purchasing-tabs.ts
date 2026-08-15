import { Contact, ShoppingCart } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Compras.
export const purchasingTabs: SectionTab[] = [
  { href: "/app/purchasing/suppliers", label: "Proveedores", icon: Contact, perm: "suppliers.read" },
  { href: "/app/purchasing/orders", label: "Órdenes de compra", icon: ShoppingCart, perm: "purchasing.read" },
];
