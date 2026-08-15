import { DollarSign, Droplet, FolderTree, Package, Tag } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Catálogo.
export const catalogTabs: SectionTab[] = [
  { href: "/app/catalog/products", label: "Productos", icon: Package, perm: "products.read" },
  { href: "/app/catalog/brands", label: "Marcas", icon: Tag, perm: "brands.read" },
  { href: "/app/catalog/categories", label: "Categorías", icon: FolderTree, perm: "categories.read" },
  { href: "/app/catalog/flavors", label: "Sabores", icon: Droplet, perm: "flavors.read" },
  { href: "/app/catalog/pricing", label: "Precios", icon: DollarSign, perm: "pricing.read" },
];
