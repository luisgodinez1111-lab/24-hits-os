"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { settingsTabs } from "@/lib/settings-tabs";

// Ventana única de Configuración: agrupa organización, sucursales, almacenes,
// usuarios, roles, auditoría y dispositivos en pestañas, en vez de 7 entradas
// de menú separadas.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();
  const tabs = settingsTabs.filter((t) => !t.perm || isLoading || hasPermission(me, t.perm));

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-title text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500">Organización, sucursales, almacenes, usuarios, roles, auditoría y dispositivos</p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
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

      {children}
    </div>
  );
}
