import { Injectable } from "@nestjs/common";
import type { Prisma } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type { SetFeatureFlagInput, UpdateSettingsInput } from "./settings.dto.js";

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async get(organizationId: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const settings =
        (await tx.organizationSettings.findUnique({ where: { organizationId } })) ??
        (await tx.organizationSettings.create({ data: { organizationId } }));
      const featureFlags = await tx.featureFlag.findMany({
        where: { organizationId },
        orderBy: { key: "asc" },
      });
      return { settings, featureFlags };
    });
  }

  async update(organizationId: string, input: UpdateSettingsInput) {
    const updated = await this.prisma.withTenant(organizationId, (tx) =>
      tx.organizationSettings.update({ where: { organizationId }, data: input })
    );
    await this.audit.record({
      action: "organization.settings_updated",
      organizationId,
      entityType: "OrganizationSettings",
      entityId: updated.id,
      after: input as Prisma.InputJsonValue,
    });
    return updated;
  }

  async setFeatureFlag(organizationId: string, input: SetFeatureFlagInput) {
    const flag = await this.prisma.withTenant(organizationId, (tx) =>
      tx.featureFlag.upsert({
        where: { organizationId_key: { organizationId, key: input.key } },
        update: { enabled: input.enabled },
        create: { organizationId, key: input.key, enabled: input.enabled },
      })
    );
    await this.audit.record({
      action: "organization.feature_flag_set",
      organizationId,
      entityType: "FeatureFlag",
      entityId: flag.id,
      after: { key: flag.key, enabled: flag.enabled },
    });
    return flag;
  }

  // Regla de producto (ADR/settings): permitir inventario negativo exige una decisión
  // explícita; NO se habilita por la vía normal de configuración.
  activateNegativeInventory(): never {
    throw AppException.badRequest(
      "Activar inventario negativo requiere una decisión de producto explícita; no puede habilitarse desde configuración."
    );
  }
}
