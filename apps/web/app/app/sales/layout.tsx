"use client";

import type { ReactNode } from "react";
import { SectionTabs } from "@/components/SectionTabs";
import { salesTabs } from "@/lib/sales-tabs";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs title="Ventas" subtitle="Punto de venta, pedidos, notas de venta y de crédito, y clientes" tabs={salesTabs} />
      {children}
    </>
  );
}
