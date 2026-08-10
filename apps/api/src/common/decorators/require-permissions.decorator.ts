import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@24hits/auth";

export const PERMISSIONS_KEY = "requiredPermissions";

// Exige que la membresía activa tenga TODOS estos permisos. Se valida en el backend
// (autoridad de seguridad). Ej: @RequirePermissions('users.manage')
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
