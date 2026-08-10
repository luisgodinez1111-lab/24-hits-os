"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Monitor } from "lucide-react";
import { Badge, Dropdown, DropdownItem } from "@24hits/ui";
import { api } from "@/lib/api";
import type { Me } from "@/lib/me";

export function Header({ me }: { me: Me | undefined }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.clear();
    router.push("/login");
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-3">
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
    </header>
  );
}
