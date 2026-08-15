"use client";

import type { ReactNode } from "react";
import { SectionTabs } from "@/components/SectionTabs";
import { reportsTabs } from "@/lib/reports-tabs";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SectionTabs title="Reportes" subtitle="Financieros, más vendidos y registro de ventas" tabs={reportsTabs} />
      {children}
    </>
  );
}
