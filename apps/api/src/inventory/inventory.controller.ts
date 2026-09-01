import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PermissionService } from "../iam/permission.service.js";
import { InventoryService } from "./inventory.service.js";
import { ReservationService } from "./reservation.service.js";
import {
  balancesQuerySchema,
  damageSchema,
  manualAdjustmentSchema,
  movementsQuerySchema,
  openingBalanceSchema,
  reserveSchema,
  type BalancesQuery,
  type DamageBody,
  type ManualAdjustmentBody,
  type MovementsQuery,
  type OpeningBalanceBody,
  type ReserveBody,
} from "./inventory.dto.js";

@ApiTags("inventory")
@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly reservations: ReservationService,
    private readonly permissions: PermissionService
  ) {}

  @Get()
  @RequirePermissions("inventory.read")
  balances(
    @CurrentUser() user: AuthContext,
    @Query(new ZodValidationPipe(balancesQuerySchema)) q: BalancesQuery
  ) {
    return this.inventory.listBalances(user.organizationId!, q);
  }

  @Get("movements")
  @RequirePermissions("inventory.movement.read")
  movements(
    @CurrentUser() user: AuthContext,
    @Query(new ZodValidationPipe(movementsQuerySchema)) q: MovementsQuery
  ) {
    return this.inventory.listMovements(user.organizationId!, q);
  }

  @Get("dashboard")
  @RequirePermissions("inventory.read")
  async dashboard(@CurrentUser() user: AuthContext) {
    const canReadCosts = await this.permissions.can(user.membershipId!, ["costs.read"]);
    return this.inventory.dashboard(user.organizationId!, canReadCosts);
  }

  @Get("value")
  @RequirePermissions("costs.read")
  value(@CurrentUser() user: AuthContext, @Query("warehouseId") warehouseId?: string) {
    return this.inventory.inventoryValue(user.organizationId!, warehouseId);
  }

  // Capital atrapado: existencias sin venta en `days` días (default 60), valoradas.
  @Get("slow-movers")
  @RequirePermissions("costs.read")
  slowMovers(@CurrentUser() user: AuthContext, @Query("days") days?: string) {
    const n = days ? Number(days) : undefined;
    return this.inventory.slowMovers(user.organizationId!, Number.isFinite(n) ? n : undefined);
  }

  @Post("opening-balance")
  @RequirePermissions("inventory.adjust")
  openingBalance(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(openingBalanceSchema)) body: OpeningBalanceBody
  ) {
    return this.inventory.openingBalance(user.organizationId!, user.userId, body);
  }

  @Post("manual-adjustments")
  @RequirePermissions("inventory.adjust")
  manualAdjustment(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(manualAdjustmentSchema)) body: ManualAdjustmentBody
  ) {
    return this.inventory.manualAdjustment(user.organizationId!, user.userId, body);
  }

  @Post("manual-adjustments/:id/approve")
  @RequirePermissions("inventory.adjust.approve")
  approveAdjustment(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.inventory.approveAdjustment(user.organizationId!, user.userId, id);
  }

  @Post("damage")
  @RequirePermissions("inventory.adjust")
  damage(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(damageSchema)) body: DamageBody
  ) {
    return this.inventory.markAsDamaged(user.organizationId!, user.userId, body);
  }

  @Post("quarantine")
  @RequirePermissions("inventory.adjust")
  quarantine(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(damageSchema)) body: DamageBody
  ) {
    return this.inventory.setQuarantine(user.organizationId!, user.userId, body, true);
  }

  @Post("quarantine/release")
  @RequirePermissions("inventory.adjust")
  releaseQuarantine(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(damageSchema)) body: DamageBody
  ) {
    return this.inventory.setQuarantine(user.organizationId!, user.userId, body, false);
  }

  @Post("reservations")
  @RequirePermissions("inventory.reserve")
  reserve(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(reserveSchema)) body: ReserveBody
  ) {
    return this.reservations.reserve(user.organizationId!, {
      ...body,
      quantity: body.quantity,
      createdByUserId: user.userId,
    });
  }

  @Post("reservations/:id/release")
  @RequirePermissions("inventory.reserve")
  async releaseReservation(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string
  ): Promise<{ ok: boolean }> {
    await this.reservations.release(user.organizationId!, id);
    return { ok: true };
  }

  @Post("rebuild")
  @RequirePermissions("inventory.adjust.approve")
  rebuild(@CurrentUser() user: AuthContext) {
    return this.inventory.rebuildBalances(user.organizationId!);
  }

  @Get("verify")
  @RequirePermissions("inventory.movement.read")
  verify(@CurrentUser() user: AuthContext) {
    // Devuelve { ok, drifts }. No corrige en silencio (ADR-011): el drift se reporta.
    return this.inventory.verifyDrift(user.organizationId!);
  }
}
