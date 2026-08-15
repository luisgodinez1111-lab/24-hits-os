"use client";

import type { ReactNode } from "react";
import { SectionTabs } from "@/components/SectionTabs";
import { inventoryTabs } from "@/lib/inventory-tabs";

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs title="Inventario" subtitle="Existencias, movimientos, transferencias y conteos" tabs={inventoryTabs} />
      {children}
    </>
  );
}
