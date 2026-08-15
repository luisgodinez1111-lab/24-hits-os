import { Building2, MapPin, Monitor, ScrollText, Shield, Users, Warehouse, type LucideIcon } from "lucide-react";
import type { PermissionKey } from "@24hits/contracts";

// Pestañas de la ventana única de Configuración. El orden define también a cuál
// se redirige al entrar (la primera que el usuario tenga permitida).
export interface SettingsTab {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: PermissionKey; // sin permiso = visible para todos (p. ej. Dispositivos propios)
}

export const settingsTabs: SettingsTab[] = [
  { href: "/app/settings/organization", label: "Organización", icon: Building2, perm: "organization.manage" },
  { href: "/app/settings/branches", label: "Sucursales", icon: MapPin, perm: "branches.read" },
  { href: "/app/settings/warehouses", label: "Almacenes", icon: Warehouse, perm: "warehouses.read" },
  { href: "/app/settings/users", label: "Usuarios", icon: Users, perm: "users.read" },
  { href: "/app/settings/roles", label: "Roles", icon: Shield, perm: "roles.read" },
  { href: "/app/settings/audit", label: "Auditoría", icon: ScrollText, perm: "audit.read" },
  { href: "/app/settings/sessions", label: "Dispositivos", icon: Monitor },
];
