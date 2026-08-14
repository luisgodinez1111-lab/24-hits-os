import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  Prisma,
  withSystem,
  withTenant,
  type ExtendedPrismaClient,
} from "@24hits/database";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { AuditService } from "../src/audit/audit.service.js";
import { CashService } from "../src/cash/cash.service.js";
import { PaymentService } from "../src/cash/payment.service.js";

const prisma: ExtendedPrismaClient = createPrismaClient();
const prismaService = {
  client: prisma,
  withTenant: (org: string, fn: never) => withTenant(prisma, org, fn),
  withSystem: (fn: never) => withSystem(prisma, fn),
} as unknown as PrismaService;
const audit = { record: async () => undefined } as unknown as AuditService;

const cash = new CashService(prismaService, audit);
const payments = new PaymentService(prismaService, audit);

const suffix = Date.now().toString(36);
let orgId: string;
let branchId: string;
let userId: string;

// Crea un pedido mínimo (total dado) directamente; los cobros operan sobre cualquier
// pedido no cancelado, independientemente del cumplimiento.
async function createOrder(total: number, status = "DRAFT"): Promise<string> {
  return withSystem(prisma, async (tx) => {
    const wh = await tx.warehouse.findFirst({ where: { organizationId: orgId }, select: { id: true } });
    const order = await tx.order.create({
      data: {
        organizationId: orgId,
        branchId,
        warehouseId: wh!.id,
        number: `SO-${randomUUID().slice(0, 8)}`,
        status: status as never,
        currency: "MXN",
        total: new Prisma.Decimal(total),
        createdByUserId: userId,
      },
    });
    return order.id;
  });
}
const orderStatus = (id: string) => withTenant(prisma, orgId, (tx) => tx.order.findFirst({ where: { id }, select: { paymentStatus: true } }));

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "Cash", slug: `cash-${suffix}` } });
    orgId = org.id;
    const branch = await tx.branch.create({ data: { organizationId: orgId, name: "B", code: `M-${suffix}` } });
    branchId = branch.id;
    await tx.warehouse.create({ data: { organizationId: orgId, branchId, name: "W", code: `M-${suffix}`, type: "MAIN" } });
    const user = await tx.user.create({ data: { email: `cash-${suffix}@example.local`, passwordHash: "x" } });
    userId = user.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.payment.deleteMany({ where: { organizationId: orgId } });
    await tx.cashMovement.deleteMany({ where: { organizationId: orgId } });
    await tx.cashSession.deleteMany({ where: { organizationId: orgId } });
    await tx.cashRegister.deleteMany({ where: { organizationId: orgId } });
    await tx.order.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
    await tx.user.delete({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

describe("Pagos/Caja — cobros, arqueo y concurrencia (ADR-022/023)", () => {
  it("una sola sesión OPEN por caja (índice único parcial)", async () => {
    const reg = await cash.createRegister(orgId, { branchId, name: "Caja 1", code: `C1-${suffix}` });
    await cash.open(orgId, userId, { registerId: reg.id, openingFloat: 0 });
    await expect(cash.open(orgId, userId, { registerId: reg.id, openingFloat: 0 })).rejects.toMatchObject({ code: "CASH_SESSION_ALREADY_OPEN" });
  });

  it("cobro en efectivo actualiza paymentStatus y suma al esperado; arqueo calcula diferencia", async () => {
    const reg = await cash.createRegister(orgId, { branchId, name: "Caja 2", code: `C2-${suffix}` });
    const session = await cash.open(orgId, userId, { registerId: reg.id, openingFloat: 100 });
    const orderId = await createOrder(100);

    // Cobro parcial en efectivo.
    await payments.record(orgId, userId, { orderId, method: "CASH", amount: 60, cashSessionId: session.id });
    expect((await orderStatus(orderId))?.paymentStatus).toBe("PARTIAL");

    // Cobro del resto con tarjeta → PAID.
    await payments.record(orgId, userId, { orderId, method: "CARD", amount: 40, reference: "auth-123" });
    expect((await orderStatus(orderId))?.paymentStatus).toBe("PAID");

    // Retiro de efectivo del cajón.
    await cash.movement(orgId, userId, { cashSessionId: session.id, type: "WITHDRAWAL", amount: 40, reason: "Retiro a bóveda" });

    // Esperado = fondo 100 + efectivo 60 − retiro 40 = 120. Contado 118 → diferencia −2.
    const closed = await cash.close(orgId, userId, session.id, { countedCash: 118 });
    expect(closed.expectedCash?.toString()).toBe("120");
    expect(closed.difference?.toString()).toBe("-2");
    expect(closed.status).toBe("CLOSED");
  });

  it("rechaza sobrepago del pedido", async () => {
    const reg = await cash.createRegister(orgId, { branchId, name: "Caja 3", code: `C3-${suffix}` });
    const session = await cash.open(orgId, userId, { registerId: reg.id, openingFloat: 0 });
    const orderId = await createOrder(100);
    await payments.record(orgId, userId, { orderId, method: "CASH", amount: 60, cashSessionId: session.id });
    await expect(payments.record(orgId, userId, { orderId, method: "CASH", amount: 50, cashSessionId: session.id }))
      .rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_TOTAL" });
  });

  it("cobro en efectivo SIN turno de caja se registra igual (turno opcional)", async () => {
    const orderId = await createOrder(50);
    const p = await payments.record(orgId, userId, { orderId, method: "CASH", amount: 50 });
    expect(p.method).toBe("CASH");
    expect((await orderStatus(orderId))?.paymentStatus).toBe("PAID");
  });

  it("anular un pago lo saca del neto y revierte el paymentStatus", async () => {
    const orderId = await createOrder(100);
    const p = await payments.record(orgId, userId, { orderId, method: "CARD", amount: 100 });
    expect((await orderStatus(orderId))?.paymentStatus).toBe("PAID");

    await payments.reverse(orgId, userId, p.id);
    expect((await orderStatus(orderId))?.paymentStatus).toBe("PENDING");

    // No se puede volver a anular.
    await expect(payments.reverse(orgId, userId, p.id)).rejects.toMatchObject({ code: "PAYMENT_INVALID_STATE" });
  });

  it("no se puede cobrar un pedido cancelado", async () => {
    const orderId = await createOrder(100, "CANCELLED");
    await expect(payments.record(orgId, userId, { orderId, method: "CARD", amount: 10 }))
      .rejects.toMatchObject({ code: "PAYMENT_INVALID_STATE" });
  });
});
