import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { CostService } from "../inventory/cost.service.js";
import { RequestContext } from "../common/context/request-context.js";

@Injectable()
export class CostAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cost: CostService,
    private readonly audit: AuditService
  ) {}

  getCost(organizationId: string, variantId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.variantCost.findUnique({ where: { variantId } })
    );
  }

  history(organizationId: string, variantId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.costHistory.findMany({ where: { variantId }, orderBy: { createdAt: "desc" }, take: 100 })
    );
  }

  async initialize(organizationId: string, userId: string, variantId: string, unitCost: number) {
    const correlationId = RequestContext.correlationId();
    await this.prisma.withTenant(organizationId, (tx) =>
      this.cost.setCost(tx, {
        organizationId,
        variantId,
        unitCost,
        sourceType: "MANUAL_COST_INITIALIZATION",
        changedByUserId: userId,
        correlationId,
      })
    );
    await this.audit.record({
      action: "cost.changed", organizationId, entityType: "VariantCost", entityId: variantId,
      after: { unitCost: String(unitCost), source: "MANUAL_COST_INITIALIZATION" },
    });
    return this.getCost(organizationId, variantId);
  }
}
