import { DollarSign, Package, Tags } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Catálogo. "Marcas y sabores" es la vista por marca
// (árbol Marca → Modelo → Sabor) + las listas maestras; antes se llamaba "Atributos"
// (término técnico que confundía). "Modelos" es la lista para dar de alta y editar.
export const catalogTabs: SectionTab[] = [
  { href: "/app/catalog/products", label: "Modelos", icon: Package, perm: "products.read" },
  { href: "/app/catalog/pricing", label: "Precios", icon: DollarSign, perm: "pricing.read" },
  { href: "/app/catalog/attributes", label: "Marcas y sabores", icon: Tags, perm: "brands.read" },
];
