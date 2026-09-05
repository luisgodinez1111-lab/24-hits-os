"use client";

import type { ReactNode } from "react";
import { SectionTabs } from "@/components/SectionTabs";
import { catalogTabs } from "@/lib/catalog-tabs";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs title="Catálogo" subtitle="Modelos y sus sabores · marcas y categorías · precios" tabs={catalogTabs} />
      {children}
    </>
  );
}
