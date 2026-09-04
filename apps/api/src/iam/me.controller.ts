import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OrganizationService } from "./organization.service.js";
import { PermissionService } from "./permission.service.js";

// Perfil de la sesión actual: identidad, organización activa, membresías y permisos.
// El frontend lo usa para pintar el shell y ocultar opciones sin permiso (la UI no
// es autoridad de seguridad; el backend siempre valida).
@ApiTags("me")
@Controller("me")
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationService,
    private readonly permissions: PermissionService
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthContext) {
    const dbUser = await this.prisma.client.user.findUnique({
      where: { id: user.userId },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });
    const userOut = dbUser
      ? { id: dbUser.id, email: dbUser.email, name: dbUser.name, emailVerified: dbUser.emailVerifiedAt != null }
      : null;
    const memberships = await this.organizations.getUserMemberships(user.userId);

    let permissions: string[] = [];
    let defaultWarehouse: { id: string; name: string } | null = null;
    if (user.membershipId) {
      permissions = [...(await this.permissions.getPermissionKeys(user.membershipId))];
      // El almacén por defecto vive en Warehouse, tabla con RLS por tenant
      // (organizationId = current_setting('app.current_org_id')). Hay que leerlo DENTRO
      // del contexto de organización: si se lee con el cliente crudo (sin withTenant),
      // app.current_org_id queda vacío, RLS filtra el join y devuelve null aunque la
      // membresía tenga defaultWarehouseId. Ver ADR-004.
      const membershipId = user.membershipId;
      if (user.organizationId) {
        defaultWarehouse = await this.prisma.withTenant(user.organizationId, async (tx) => {
          const membership = await tx.organizationMembership.findUnique({
            where: { id: membershipId },
            select: { defaultWarehouse: { select: { id: true, name: true } } },
          });
          return membership?.defaultWarehouse ?? null;
        });
      }
    }
    const activeOrganization =
      memberships.find((m) => m.organization.id === user.organizationId)?.organization ??
      null;

    return {
      user: userOut,
      organizationId: user.organizationId ?? null,
      membershipId: user.membershipId ?? null,
      activeOrganization,
      defaultWarehouse,
      memberships,
      permissions,
    };
  }
}
