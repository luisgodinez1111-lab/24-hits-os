"use client";

import { useQuery } from "@tanstack/react-query";
import type { Membership, PermissionKey } from "@24hits/contracts";
import { api } from "./api";

export interface Me {
  user: { id: string; email: string; name: string | null } | null;
  organizationId: string | null;
  membershipId: string | null;
  activeOrganization: { id: string; name: string; slug: string; status: string } | null;
  defaultWarehouse: { id: string; name: string } | null;
  memberships: Membership[];
  permissions: PermissionKey[];
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/me"),
    retry: false,
  });
}

// Comprueba permisos en el cliente (solo para ocultar UI; el backend valida).
export function hasPermission(me: Me | undefined, permission: PermissionKey): boolean {
  return Boolean(me?.permissions.includes(permission));
}
