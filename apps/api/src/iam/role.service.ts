import { Injectable } from "@nestjs/common";
import { PERMISSIONS } from "@24hits/auth";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { PermissionService } from "./permission.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type { CreateRoleInput, UpdateRolePermissionsInput } from "./role.dto.js";

const CATALOG_KEYS = new Set<string>(PERMISSIONS.map((p) => p.key));

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionService
  ) {}

  // Catálogo de permisos (agrupado por categoría) para construir la UI de roles.
  permissionCatalog() {
    const byCategory = new Map<string, typeof PERMISSIONS[number][]>();
    for (const p of PERMISSIONS) {
      const list = byCategory.get(p.category) ?? [];
      list.push(p);
      byCategory.set(p.category, list);
    }
    return [...byCategory.entries()].map(([category, permissions]) => ({
      category,
      permissions,
    }));
  }

  // Roles disponibles para la organización: sus roles propios + plantillas del sistema.
  list(organizationId: string) {
    return this.prisma.client.role.findMany({
      where: { OR: [{ organizationId }, { organizationId: null, isSystem: true }] },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isSystem: true,
        organizationId: true,
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { membershipRoles: true } },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
  }

  private validateKeys(permissionKeys: string[]): void {
    const invalid = permissionKeys.filter((k) => !CATALOG_KEYS.has(k));
    if (invalid.length) {
      throw AppException.badRequest(`Permisos inválidos: ${invalid.join(", ")}`);
    }
  }

  private async permissionIdsFor(permissionKeys: string[]): Promise<string[]> {
    const rows = await this.prisma.client.permission.findMany({
      where: { key: { in: permissionKeys } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async create(organizationId: string, input: CreateRoleInput) {
    this.validateKeys(input.permissionKeys);
    const duplicate = await this.prisma.client.role.findFirst({
      where: { organizationId, key: input.key },
      select: { id: true },
    });
    if (duplicate) throw AppException.conflict("Ya existe un rol con esa clave");

    const permissionIds = await this.permissionIdsFor(input.permissionKeys);
    const role = await this.prisma.client.role.create({
      data: {
        organizationId,
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
      select: { id: true, key: true, name: true },
    });
    await this.audit.record({
      action: "role.created",
      organizationId,
      entityType: "Role",
      entityId: role.id,
      after: { key: role.key, name: role.name, permissionKeys: input.permissionKeys },
    });
    return role;
  }

  async updatePermissions(
    organizationId: string,
    roleId: string,
    input: UpdateRolePermissionsInput
  ): Promise<void> {
    this.validateKeys(input.permissionKeys);
    const role = await this.prisma.client.role.findFirst({
      where: { id: roleId, organizationId },
      select: { id: true, isSystem: true },
    });
    if (!role) throw AppException.notFound("Rol no encontrado");
    if (role.isSystem) {
      throw AppException.badRequest("Los roles del sistema no se pueden modificar");
    }

    const permissionIds = await this.permissionIdsFor(input.permissionKeys);
    await this.prisma.client.$transaction([
      this.prisma.client.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.client.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        skipDuplicates: true,
      }),
    ]);

    // Invalidar el caché de permisos de todas las membresías con este rol.
    const affected = await this.prisma.client.membershipRole.findMany({
      where: { roleId },
      select: { membershipId: true },
    });
    await Promise.all(affected.map((m) => this.permissions.invalidate(m.membershipId)));

    await this.audit.record({
      action: "role.updated",
      organizationId,
      entityType: "Role",
      entityId: roleId,
      after: { permissionKeys: input.permissionKeys },
    });
  }
}
