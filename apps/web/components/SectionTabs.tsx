"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import type { PermissionKey } from "@24hits/contracts";
import { cn } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";

// Encabezado + barra de pestañas para agrupar varias pantallas en una sola
// ventana. Reutilizable por Configuración, Catálogo, Reportes, etc.
export interface SectionTab {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: PermissionKey; // sin permiso = visible para todos
  exact?: boolean; // activa solo con coincidencia exacta (para la pestaña índice)
}

export function SectionTabs({ title, subtitle, tabs }: { title: string; subtitle?: string; tabs: SectionTab[] }) {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();
  const visible = tabs.filter((t) => !t.perm || isLoading || hasPermission(me, t.perm));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {visible.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
