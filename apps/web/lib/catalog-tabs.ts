import { DollarSign, Package, Tags } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Catálogo. Marcas, categorías y sabores son
// listas simples, así que se agrupan en un solo "Atributos" en vez de 3 páginas.
export const catalogTabs: SectionTab[] = [
  { href: "/app/catalog/products", label: "Modelos", icon: Package, perm: "products.read" },
  { href: "/app/catalog/pricing", label: "Precios", icon: DollarSign, perm: "pricing.read" },
  { href: "/app/catalog/attributes", label: "Atributos", icon: Tags, perm: "brands.read" },
];
