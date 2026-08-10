import { Injectable } from "@nestjs/common";
import type { Prisma, Warehouse } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type { CreateWarehouseInput, UpdateWarehouseInput } from "./warehouse.dto.js";

function auditView(w: Warehouse): Prisma.InputJsonValue {
  return { name: w.name, code: w.code, type: w.type, status: w.status, branchId: w.branchId };
}

// Almacenes por sucursal. Tenant-scoped (RLS + withTenant). Un almacén de otra
// organización se comporta como inexistente (404).
@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string, branchId?: string): Promise<Warehouse[]> {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.warehouse.findMany({
        where: branchId ? { branchId } : {},
        orderBy: { createdAt: "asc" },
      })
    );
  }

  async create(organizationId: string, input: CreateWarehouseInput): Promise<Warehouse> {
    const warehouse = await this.prisma.withTenant(organizationId, async (tx) => {
      // La sucursal debe existir dentro del tenant (RLS filtra otras organizaciones).
      const branch = await tx.branch.findFirst({ where: { id: input.branchId } });
      if (!branch) throw AppException.badRequest("Sucursal no encontrada en la organización");
      return tx.warehouse.create({
        data: {
          organizationId,
          branchId: input.branchId,
          name: input.name,
          code: input.code,
          type: input.type,
        },
      });
    });
    await this.audit.record({
      action: "warehouse.created",
      organizationId,
      branchId: warehouse.branchId,
      entityType: "Warehouse",
      entityId: warehouse.id,
      after: auditView(warehouse),
    });
    return warehouse;
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateWarehouseInput
  ): Promise<Warehouse> {
    const before = await this.prisma.withTenant(organizationId, (tx) =>
      tx.warehouse.findFirst({ where: { id } })
    );
    if (!before) throw AppException.notFound("Almacén no encontrado");

    const after = await this.prisma.withTenant(organizationId, (tx) =>
      tx.warehouse.update({ where: { id }, data: input })
    );
    await this.audit.record({
      action: "warehouse.updated",
      organizationId,
      branchId: after.branchId,
      entityType: "Warehouse",
      entityId: id,
      before: auditView(before),
      after: auditView(after),
    });
    return after;
  }
}
