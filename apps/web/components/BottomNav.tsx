"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@24hits/ui";
import { hasPermission, useMe } from "@/lib/me";
import { bottomNavItems } from "@/lib/nav";

// Barra de navegación inferior, SOLO en móvil/tablet (lg:hidden). Atajo a las acciones
// del día para cajero (tablet) y repartidor (celular); el menú completo sigue en el
// cajón lateral (☰). z-20: la navegación a pantalla completa de la ruta (z-30) la tapa.
export function BottomNav() {
  const pathname = usePathname();
  const { data: me, isLoading } = useMe();
  const items = bottomNavItems.filter((i) => !i.perm || isLoading || hasPermission(me, i.perm));
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Accesos rápidos"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        const Icon = i.icon;
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors active:scale-95",
              active ? "text-brand" : "text-gray-500"
            )}
          >
            <Icon className={cn("h-5 w-5", active ? "text-brand" : "text-gray-400")} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
