import { ArrowLeftRight, Boxes, ClipboardList, Truck } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Inventario. "Existencias" es la índice (exact).
export const inventoryTabs: SectionTab[] = [
  { href: "/app/inventory", label: "Existencias", icon: Boxes, perm: "inventory.read", exact: true },
  { href: "/app/inventory/movements", label: "Movimientos", icon: ArrowLeftRight, perm: "inventory.movement.read" },
  { href: "/app/inventory/transfers", label: "Transferencias", icon: Truck, perm: "inventory.read" },
  { href: "/app/inventory/counts", label: "Conteos", icon: ClipboardList, perm: "inventory.read" },
];
