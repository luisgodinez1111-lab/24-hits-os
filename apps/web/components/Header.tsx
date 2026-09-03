"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Monitor, Search } from "lucide-react";
import { Badge, Dropdown, DropdownItem } from "@24hits/ui";
import { api } from "@/lib/api";
import type { Me } from "@/lib/me";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { OPEN_COMMAND_PALETTE } from "./CommandPalette";

export function Header({ me, onMenu }: { me: Me | undefined; onMenu?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.clear();
    router.push("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Abrir menú"
          className="grid h-9 w-9 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {me?.activeOrganization ? (
          <>
            <span className="text-sm font-semibold text-gray-900">
              {me.activeOrganization.name}
            </span>
            <Badge tone="brand">{me.activeOrganization.status}</Badge>
          </>
        ) : (
          <span className="text-sm text-gray-400">Sin organización activa</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Abre el Command palette (⌘K). Descubrible + táctil (también funciona con clic). */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE))}
          aria-label="Buscar y navegar (Command+K)"
          className="hidden items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 sm:flex"
        >
          <Search className="h-4 w-4" />
          <span>Buscar…</span>
          <kbd className="rounded border border-gray-200 px-1 text-[10px] font-medium">⌘K</kbd>
        </button>
        <ThemeToggle />
        <NotificationBell />
        <Dropdown
          trigger={
            <span className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-gray-700 hover:bg-gray-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {(me?.user?.name ?? me?.user?.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              {me?.user?.name ?? me?.user?.email ?? "Cuenta"}
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </span>
          }
        >
        <DropdownItem onClick={() => router.push("/app/settings/sessions")}>
          <span className="flex items-center gap-2">
            <Monitor className="h-4 w-4" /> Dispositivos
          </span>
        </DropdownItem>
          <DropdownItem onClick={logout}>
            <span className="flex items-center gap-2">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </span>
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
