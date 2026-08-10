import { Injectable } from "@nestjs/common";
import { newId } from "@24hits/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type { BootstrapOrganizationInput } from "./iam.dto.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // Flujo de registro de organización: crea Org + Settings + primera Branch +
  // Warehouse + Membership del Owner, todo en una transacción. El usuario pasa a
  // ser Organization Owner. Ver docs/architecture/authentication.md.
  async bootstrapOrganization(userId: string, input: BootstrapOrganizationInput) {
    const ownerRole = await this.prisma.client.role.findFirst({
      where: { key: "organization_owner", isSystem: true, organizationId: null },
      select: { id: true },
    });
    if (!ownerRole) {
      throw AppException.badRequest(
        "Roles del sistema no inicializados. Ejecuta el seed (pnpm db:seed)."
      );
    }

    const baseSlug = input.slug ?? slugify(input.organizationName);
    const slug = await this.ensureUniqueSlug(baseSlug);

    // withSystem: el bootstrap crea filas org-scoped (Branch/Warehouse/Settings con
    // RLS) antes de que exista contexto de tenant → requiere bypass de RLS.
    const result = await this.prisma.withSystem(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: input.organizationName, slug },
      });

      await tx.organizationSettings.create({
        data: {
          organizationId: organization.id,
          timezone: organization.timezone,
          defaultCurrency: organization.currency,
        },
      });

      const branch = await tx.branch.create({
        data: {
          organizationId: organization.id,
          name: input.branchName,
          code: "MAIN",
        },
      });

      await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          branchId: branch.id,
          name: input.warehouseName,
          code: "MAIN",
          type: "MAIN",
        },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          userId,
          organizationId: organization.id,
          status: "ACTIVE",
        },
      });

      await tx.membershipRole.create({
        data: { membershipId: membership.id, roleId: ownerRole.id },
      });

      return { organization, branch, membership };
    });

    await this.audit.record({
      action: "organization.created",
      organizationId: result.organization.id,
      actorUserId: userId,
      entityType: "Organization",
      entityId: result.organization.id,
      after: { name: result.organization.name, slug: result.organization.slug },
    });

    return result;
  }

  async getUserMemberships(userId: string) {
    return this.prisma.client.organizationMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
  }

  // Devuelve la membresía activa del usuario en la organización, o null.
  async findActiveMembership(userId: string, organizationId: string) {
    return this.prisma.client.organizationMembership.findFirst({
      where: { userId, organizationId, status: "ACTIVE" },
      select: { id: true, organizationId: true },
    });
  }

  private async ensureUniqueSlug(base: string): Promise<string> {
    const candidate = base || `org-${newId().slice(0, 8)}`;
    const existing = await this.prisma.client.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    return `${candidate}-${newId().slice(0, 6)}`;
  }
}
