import { DollarSign, Package } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// UNA sola vista del catálogo: "Modelos" es el árbol Marca → Modelo → Sabor (con alta
// de un tiro + escaneo y las listas maestras). "Precios" gestiona las listas. Antes
// había una tabla de "Modelos" + "Atributos" separadas; se unificaron en el árbol
// (vive en /attributes; /products redirige ahí).
export const catalogTabs: SectionTab[] = [
  { href: "/app/catalog/attributes", label: "Modelos", icon: Package, perm: "products.read" },
  { href: "/app/catalog/pricing", label: "Precios", icon: DollarSign, perm: "pricing.read" },
];
