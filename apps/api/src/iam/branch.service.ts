import { Injectable } from "@nestjs/common";
import type { Branch, Prisma } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type { CreateBranchInput, UpdateBranchInput } from "./iam.dto.js";

// Proyección JSON-safe de una sucursal para auditoría (sin Date/Decimal crudos).
function auditView(branch: Branch): Prisma.InputJsonValue {
  return {
    name: branch.name,
    code: branch.code,
    phone: branch.phone,
    address: branch.address,
    status: branch.status,
  };
}

// Todas las operaciones pasan por withTenant → RLS + contexto de organización.
// Un recurso de otra organización se comporta como inexistente (404, no-enumeración).
@Injectable()
export class BranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(organizationId: string): Promise<Branch[]> {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.branch.findMany({ orderBy: { createdAt: "asc" } })
    );
  }

  async getById(organizationId: string, id: string): Promise<Branch> {
    const branch = await this.prisma.withTenant(organizationId, (tx) =>
      tx.branch.findFirst({ where: { id } })
    );
    if (!branch) throw AppException.notFound("Sucursal no encontrada");
    return branch;
  }

  async create(organizationId: string, input: CreateBranchInput): Promise<Branch> {
    const branch = await this.prisma.withTenant(organizationId, (tx) =>
      tx.branch.create({
        data: {
          organizationId,
          name: input.name,
          code: input.code,
          phone: input.phone,
          address: input.address,
        },
      })
    );
    await this.audit.record({
      action: "branch.created",
      organizationId,
      branchId: branch.id,
      entityType: "Branch",
      entityId: branch.id,
      after: auditView(branch),
    });
    return branch;
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateBranchInput
  ): Promise<Branch> {
    const before = await this.prisma.withTenant(organizationId, (tx) =>
      tx.branch.findFirst({ where: { id } })
    );
    if (!before) throw AppException.notFound("Sucursal no encontrada");

    const after = await this.prisma.withTenant(organizationId, (tx) =>
      tx.branch.update({ where: { id }, data: input })
    );

    await this.audit.record({
      action: "branch.updated",
      organizationId,
      branchId: id,
      entityType: "Branch",
      entityId: id,
      before: auditView(before),
      after: auditView(after),
    });
    return after;
  }
}
