import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { Env } from "@24hits/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { EmailService } from "../email/email.service.js";
import { PermissionService } from "./permission.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ENV } from "../config/app-config.module.js";
import type {
  InviteMemberInput,
  SetMemberStatusInput,
  SetMemberWarehouseInput,
  UpdateMemberRolesInput,
} from "./member.dto.js";

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly permissions: PermissionService,
    @Inject(ENV) private readonly env: Env
  ) {}

  // Lista las membresías de la organización con usuario, roles y almacén asignado.
  async list(organizationId: string) {
    const members = await this.prisma.client.organizationMembership.findMany({
      where: { organizationId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, status: true } },
        roles: { select: { role: { select: { id: true, key: true, name: true } } } },
        defaultWarehouseId: true,
      },
      orderBy: { createdAt: "asc" },
    });
    // El NOMBRE del almacén vive en Warehouse (tabla TENANT con RLS). Si se leyera como
    // join anidado con el cliente base, en prod la RLS lo filtra a null y el almacén
    // asignado "desaparece" en la UI aunque esté guardado. Se resuelve dentro de
    // withTenant, donde la RLS sí ve los almacenes de la organización.
    const whIds = [...new Set(members.map((m) => m.defaultWarehouseId).filter((v): v is string => !!v))];
    const warehouses = whIds.length
      ? await this.prisma.withTenant(organizationId, (tx) =>
          tx.warehouse.findMany({ where: { id: { in: whIds } }, select: { id: true, name: true } })
        )
      : [];
    const byId = new Map(warehouses.map((w) => [w.id, w]));
    return members.map(({ defaultWarehouseId, ...m }) => ({
      ...m,
      defaultWarehouse: defaultWarehouseId ? byId.get(defaultWarehouseId) ?? null : null,
    }));
  }

  // Asigna (o quita) el almacén fijo del usuario. Valida que el almacén sea de la org.
  async setDefaultWarehouse(
    organizationId: string,
    membershipId: string,
    input: SetMemberWarehouseInput
  ): Promise<void> {
    await this.getMembershipInOrg(organizationId, membershipId);
    if (input.defaultWarehouseId) {
      // Warehouse es tabla TENANT (RLS): debe leerse dentro de withTenant, si no
      // el cliente base la filtra a vacío en prod y da un falso "no pertenece".
      const whId = input.defaultWarehouseId;
      const wh = await this.prisma.withTenant(organizationId, (tx) =>
        tx.warehouse.findFirst({ where: { id: whId }, select: { id: true } })
      );
      if (!wh) throw AppException.badRequest("El almacén no pertenece a la organización");
    }
    await this.prisma.client.organizationMembership.update({
      where: { id: membershipId },
      data: { defaultWarehouseId: input.defaultWarehouseId },
    });
    await this.audit.record({
      action: "membership.warehouse_changed",
      organizationId,
      entityType: "OrganizationMembership",
      entityId: membershipId,
      after: { defaultWarehouseId: input.defaultWarehouseId },
    });
  }

  // Valida que los roles pertenezcan a la organización o sean del sistema.
  private async assertRolesValid(organizationId: string, roleIds: string[]): Promise<void> {
    const count = await this.prisma.client.role.count({
      where: {
        id: { in: roleIds },
        OR: [{ organizationId }, { organizationId: null, isSystem: true }],
      },
    });
    if (count !== new Set(roleIds).size) {
      throw AppException.badRequest("Uno o más roles no son válidos para la organización");
    }
  }

  async invite(organizationId: string, actorUserId: string, input: InviteMemberInput) {
    await this.assertRolesValid(organizationId, input.roleIds);
    const email = input.email.toLowerCase();

    // Usuario global: reutiliza si existe, si no lo crea con contraseña aleatoria.
    let user = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) {
      const randomPassword = randomBytes(32).toString("base64url");
      const passwordHash = await argon2.hash(randomPassword, { type: argon2.argon2id });
      user = await this.prisma.client.user.create({
        data: { email, name: input.name ?? null, passwordHash },
        select: { id: true, email: true },
      });
    }

    const existing = await this.prisma.client.organizationMembership.findFirst({
      where: { userId: user.id, organizationId },
      select: { id: true },
    });
    if (existing) throw AppException.conflict("El usuario ya es miembro de la organización");

    const membership = await this.prisma.client.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId,
        status: "ACTIVE",
        invitedByUserId: actorUserId,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
      select: { id: true },
    });

    // Token para que el invitado establezca su contraseña.
    const token = randomBytes(48).toString("base64url");
    await this.prisma.client.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS),
      },
    });
    // Link para que el invitado establezca su contraseña. Se DEVUELVE al admin para que
    // lo comparta (WhatsApp, etc.) — no dependemos del correo. El envío por email queda
    // como intento extra (no bloquea si no hay proveedor configurado).
    const inviteUrl = `${this.env.APP_URL}/reset-password?token=${token}`;
    await this.email
      .send({
        to: user.email,
        subject: "Te invitaron a 24 HITS OS",
        template: "member-invitation",
        data: { url: inviteUrl },
      })
      .catch(() => undefined);

    await this.audit.record({
      action: "user.invited",
      organizationId,
      entityType: "OrganizationMembership",
      entityId: membership.id,
      after: { email: user.email, roleIds: input.roleIds },
    });
    return { membershipId: membership.id, inviteUrl };
  }

  async updateRoles(
    organizationId: string,
    membershipId: string,
    input: UpdateMemberRolesInput
  ): Promise<void> {
    const membership = await this.getMembershipInOrg(organizationId, membershipId);
    await this.assertRolesValid(organizationId, input.roleIds);

    await this.prisma.client.$transaction([
      this.prisma.client.membershipRole.deleteMany({ where: { membershipId } }),
      this.prisma.client.membershipRole.createMany({
        data: input.roleIds.map((roleId) => ({ membershipId, roleId })),
        skipDuplicates: true,
      }),
    ]);
    await this.permissions.invalidate(membershipId);
    await this.audit.record({
      action: "membership.role_changed",
      organizationId,
      entityType: "OrganizationMembership",
      entityId: membershipId,
      after: { roleIds: input.roleIds },
      metadata: { userId: membership.userId },
    });
  }

  async setStatus(
    organizationId: string,
    membershipId: string,
    input: SetMemberStatusInput
  ): Promise<void> {
    await this.getMembershipInOrg(organizationId, membershipId);
    await this.prisma.client.organizationMembership.update({
      where: { id: membershipId },
      data: { status: input.status },
    });
    await this.permissions.invalidate(membershipId);
    await this.audit.record({
      action: "membership.status_changed",
      organizationId,
      entityType: "OrganizationMembership",
      entityId: membershipId,
      after: { status: input.status },
    });
  }

  // Elimina al usuario de la organización (borra su membresía). NO borra la cuenta
  // global del usuario (puede pertenecer a otras orgs y arrastraría su historial). Las
  // filas hijas (roles, sucursales) se borran solas por onDelete: Cascade. No puedes
  // eliminarte a ti mismo → la org nunca se queda sin dueño (quien actúa último no puede
  // quitarse a sí mismo).
  async remove(organizationId: string, membershipId: string, actorUserId: string): Promise<void> {
    const membership = await this.getMembershipInOrg(organizationId, membershipId);
    if (membership.userId === actorUserId) {
      throw AppException.badRequest("No puedes eliminarte a ti mismo de la organización.");
    }
    await this.prisma.client.organizationMembership.delete({ where: { id: membershipId } });
    await this.permissions.invalidate(membershipId);
    await this.audit.record({
      action: "membership.removed",
      organizationId,
      entityType: "OrganizationMembership",
      entityId: membershipId,
      metadata: { userId: membership.userId },
    });
  }

  private async getMembershipInOrg(organizationId: string, membershipId: string) {
    const membership = await this.prisma.client.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      select: { id: true, userId: true },
    });
    if (!membership) throw AppException.notFound("Membresía no encontrada");
    return membership;
  }
}
