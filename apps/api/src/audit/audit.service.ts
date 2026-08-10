import { Injectable } from "@nestjs/common";
import type { Prisma } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { RequestContext } from "../common/context/request-context.js";
import type { AuditQuery } from "./audit.dto.js";

export interface AuditInput {
  action: string;
  organizationId?: string;
  branchId?: string;
  entityType?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  // Para eventos previos a la autenticación (p.ej. login.failure) se puede
  // especificar el actor de forma explícita.
  actorUserId?: string;
}

// Escribe eventos de auditoría. Rellena automáticamente actor, sesión, IP,
// user-agent y correlationId desde el contexto de la request. Append-only:
// no expone updates/deletes (ver security-model).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    const store = RequestContext.get();
    const auth = store?.auth;

    await this.prisma.client.auditEvent.create({
      data: {
        action: input.action,
        organizationId: input.organizationId ?? auth?.organizationId ?? null,
        actorUserId: input.actorUserId ?? auth?.userId ?? null,
        sessionId: auth?.sessionId ?? null,
        branchId: input.branchId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        before: input.before,
        after: input.after,
        metadata: input.metadata,
        ipAddress: store?.ip ?? null,
        userAgent: store?.userAgent ?? null,
        correlationId: store?.correlationId ?? null,
      },
    });
  }

  // Listado paginado por cursor, acotado a la organización. Solo lectura
  // (la auditoría es append-only: no hay update/delete expuestos).
  async list(organizationId: string, query: AuditQuery) {
    const events = await this.prisma.client.auditEvent.findMany({
      where: {
        organizationId,
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        actorUserId: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        correlationId: true,
        createdAt: true,
        metadata: true,
      },
    });

    const hasMore = events.length > query.limit;
    const items = hasMore ? events.slice(0, query.limit) : events;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }
}
