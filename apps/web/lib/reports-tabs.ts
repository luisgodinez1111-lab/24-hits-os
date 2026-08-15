import { BarChart3, BookText, LayoutDashboard, TrendingUp } from "lucide-react";
import type { SectionTab } from "@/components/SectionTabs";

// Pestañas de la ventana única de Reportes. "Tablero" es la índice (exact).
export const reportsTabs: SectionTab[] = [
  { href: "/app/reports", label: "Tablero", icon: LayoutDashboard, perm: "reports.read", exact: true },
  { href: "/app/reports/financials", label: "Financieros", icon: TrendingUp, perm: "reports.read" },
  { href: "/app/reports/analysis", label: "Más vendidos", icon: BarChart3, perm: "reports.read" },
  { href: "/app/reports/register", label: "Registro de ventas", icon: BookText, perm: "reports.read" },
];
