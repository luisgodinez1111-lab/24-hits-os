import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionKey } from "@24hits/auth";
import { PERMISSIONS_KEY } from "../decorators/require-permissions.decorator.js";
import { RequestContext } from "../context/request-context.js";
import { AppException } from "../errors/app-exception.js";
import { PermissionService } from "../../iam/permission.service.js";

// Punto de decisión de autorización (PDP). Evalúa los permisos requeridos por el
// endpoint contra los de la membresía activa. Autoridad de seguridad del backend.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const auth = RequestContext.auth();
    // Sin organización activa no hay permisos evaluables (falta seleccionar org).
    if (!auth?.membershipId || !auth.organizationId) {
      throw AppException.forbidden("Selecciona una organización para continuar");
    }

    const granted = await this.permissions.can(auth.membershipId, required);
    if (!granted) {
      throw AppException.forbidden();
    }
    return true;
  }
}
