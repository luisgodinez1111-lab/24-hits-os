import { Injectable } from "@nestjs/common";
import { Prisma, type CashSession, type TenantTx } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AppException } from "../common/errors/app-exception.js";
import { ErrorCode } from "../common/errors/error-codes.js";
import type { CloseSessionInput, CashMovementInput, CreateRegisterInput, OpenSessionInput } from "./cash.dto.js";

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  // --- Cajas ---
  listRegisters(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.cashRegister.findMany({ orderBy: { createdAt: "desc" } })
    );
  }

  async createRegister(organizationId: string, input: CreateRegisterInput) {
    const register = await this.prisma.withTenant(organizationId, async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId }, select: { id: true } });
      if (!branch) throw AppException.badRequest("Sucursal no encontrada");
      try {
        return await tx.cashRegister.create({
          data: { organizationId, branchId: input.branchId, name: input.name, code: input.code },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw AppException.conflict("Ya existe una caja con ese código");
        }
        throw err;
      }
    });
    await this.audit.record({ action: "cash_register.created", organizationId, entityType: "CashRegister", entityId: register.id, after: { code: register.code } });
    return register;
  }

  // --- Turnos ---
  listSessions(organizationId: string) {
    return this.prisma.withTenant(organizationId, (tx) =>
      tx.cashSession.findMany({ orderBy: { openedAt: "desc" }, take: 100 })
    );
  }

  async getSession(organizationId: string, id: string) {
    return this.prisma.withTenant(organizationId, async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id },
        include: { movements: { orderBy: { createdAt: "desc" } } },
      });
      if (!session) throw new AppException(404, ErrorCode.CASH_SESSION_NOT_FOUND, "Turno de caja no encontrado");
      // Efectivo esperado en vivo (si sigue abierto) o el snapshot al cierre.
      const expected = session.status === "OPEN" ? await this.computeExpectedCash(tx, session) : new Prisma.Decimal(session.expectedCash ?? 0);
      return { ...session, expectedCashLive: expected.toString() };
    });
  }

  // Apertura: el índice único parcial garantiza una sola sesión OPEN por caja.
  async open(organizationId: string, userId: string, input: OpenSessionInput): Promise<CashSession> {
    const session = await this.prisma.withTenant(organizationId, async (tx) => {
      const register = await tx.cashRegister.findFirst({ where: { id: input.registerId } });
      if (!register) throw new AppException(404, ErrorCode.CASH_REGISTER_NOT_FOUND, "Caja no encontrada");
      if (register.status !== "ACTIVE") throw AppException.conflict("La caja está inactiva");
      try {
        return await tx.cashSession.create({
          data: {
            organizationId,
            branchId: register.branchId,
            registerId: register.id,
            openingFloat: new Prisma.Decimal(input.openingFloat),
            openedByUserId: userId,
            notes: input.notes ?? null,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new AppException(409, ErrorCode.CASH_SESSION_ALREADY_OPEN, "La caja ya tiene un turno abierto");
        }
        throw err;
      }
    });
    await this.audit.record({ action: "cash_session.opened", organizationId, entityType: "CashSession", entityId: session.id, after: { registerId: session.registerId, openingFloat: session.openingFloat.toString() } });
    return session;
  }

  async movement(organizationId: string, userId: string, input: CashMovementInput) {
    const movement = await this.prisma.withTenant(organizationId, async (tx) => {
      const session = await tx.cashSession.findFirst({ where: { id: input.cashSessionId }, select: { id: true, status: true } });
      if (!session) throw new AppException(404, ErrorCode.CASH_SESSION_NOT_FOUND, "Turno de caja no encontrado");
      if (session.status !== "OPEN") throw new AppException(409, ErrorCode.CASH_SESSION_NOT_OPEN, "El turno no está abierto");
      return tx.cashMovement.create({
        data: {
          organizationId,
          cashSessionId: input.cashSessionId,
          type: input.type,
          amount: new Prisma.Decimal(input.amount),
          reason: input.reason,
          createdByUserId: userId,
        },
      });
    });
    await this.audit.record({ action: "cash.movement", organizationId, entityType: "CashMovement", entityId: movement.id, after: { type: movement.type, amount: movement.amount.toString() } });
    return movement;
  }

  // Cierre con arqueo: congela el esperado, guarda contado y diferencia (ADR-023).
  async close(organizationId: string, userId: string, sessionId: string, input: CloseSessionInput): Promise<CashSession> {
    const session = await this.prisma.withTenant(organizationId, async (tx) => {
      const s = await tx.cashSession.findFirst({ where: { id: sessionId } });
      if (!s) throw new AppException(404, ErrorCode.CASH_SESSION_NOT_FOUND, "Turno de caja no encontrado");
      if (s.status !== "OPEN") throw new AppException(409, ErrorCode.CASH_SESSION_NOT_OPEN, "El turno no está abierto");

      const expected = await this.computeExpectedCash(tx, s);
      const counted = new Prisma.Decimal(input.countedCash);
      const difference = counted.minus(expected);

      const updated = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: "CLOSED",
          closedByUserId: userId,
          closedAt: new Date(),
          expectedCash: expected,
          countedCash: counted,
          difference,
          notes: input.notes ?? s.notes,
        },
      });

      // "Que los números cuadren": si el arqueo NO cuadra, se alerta al dueño para
      // revisión (no se corrige nada). Notifica cualquier diferencia distinta de cero;
      // el título lleva el monto para que se vea la magnitud de un vistazo.
      if (!difference.isZero()) {
        const kind = difference.isNegative() ? "faltante" : "sobrante";
        const abs = difference.abs().toString();
        await tx.notification.create({
          data: {
            organizationId,
            recipientUserId: null,
            type: "SYSTEM",
            severity: "WARNING",
            title: `Descuadre de caja: ${kind} de ${abs}`,
            body: `El cierre del turno tiene un ${kind} de ${abs} (esperado ${expected.toString()}, contado ${counted.toString()}). Revisa el arqueo.`,
            entityType: "CashSession",
            entityId: sessionId,
            dedupeKey: `cash-diff:${sessionId}`,
          },
        });
      }

      return updated;
    });
    await this.audit.record({
      action: "cash_session.closed",
      organizationId,
      entityType: "CashSession",
      entityId: session.id,
      after: { expectedCash: session.expectedCash?.toString(), countedCash: session.countedCash?.toString(), difference: session.difference?.toString() },
    });
    return session;
  }

  // Efectivo esperado = fondo + Σ pagos CASH COMPLETED + Σ DEPOSIT − Σ (WITHDRAWAL + EXPENSE).
  // Derivado del ledger; nunca un campo editable.
  async computeExpectedCash(tx: TenantTx, session: { id: string; openingFloat: Prisma.Decimal }): Promise<Prisma.Decimal> {
    const [cashPaid, deposits, outflows] = await Promise.all([
      tx.payment.aggregate({ where: { cashSessionId: session.id, method: "CASH", status: "COMPLETED" }, _sum: { amount: true } }),
      tx.cashMovement.aggregate({ where: { cashSessionId: session.id, type: "DEPOSIT" }, _sum: { amount: true } }),
      tx.cashMovement.aggregate({ where: { cashSessionId: session.id, type: { in: ["WITHDRAWAL", "EXPENSE"] } }, _sum: { amount: true } }),
    ]);
    return new Prisma.Decimal(session.openingFloat)
      .plus(cashPaid._sum.amount ?? 0)
      .plus(deposits._sum.amount ?? 0)
      .minus(outflows._sum.amount ?? 0);
  }
}
