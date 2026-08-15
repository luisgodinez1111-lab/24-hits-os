"use client";

import type { ReactNode } from "react";
import { SectionTabs } from "@/components/SectionTabs";
import { purchasingTabs } from "@/lib/purchasing-tabs";

export default function PurchasingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs title="Compras" subtitle="Proveedores y órdenes de compra" tabs={purchasingTabs} />
      {children}
    </>
  );
}
