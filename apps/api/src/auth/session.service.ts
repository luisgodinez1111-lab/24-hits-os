import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "@24hits/config";
import { newId } from "@24hits/shared";
import type { Session } from "@24hits/database";
import { PrismaService } from "../prisma/prisma.service.js";
import { ENV } from "../config/app-config.module.js";

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
  device?: string;
}

// Gestiona sesiones con estado (crear, rotar, revocar). Tabla global (sin RLS).
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env
  ) {}

  async create(params: {
    userId: string;
    organizationId?: string;
    refreshTokenHash: string;
    meta: SessionMeta;
  }): Promise<Session> {
    const expiresAt = new Date(Date.now() + this.env.JWT_REFRESH_TTL * 1000);
    return this.prisma.client.session.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId ?? null,
        refreshTokenHash: params.refreshTokenHash,
        familyId: newId(),
        ip: params.meta.ip ?? null,
        userAgent: params.meta.userAgent ?? null,
        device: params.meta.device ?? null,
        expiresAt,
      },
    });
  }

  findValidByHash(refreshTokenHash: string): Promise<Session | null> {
    return this.prisma.client.session.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  // Rotación en sitio: reemplaza el hash del refresh y renueva la expiración,
  // conservando la sesión (y su familyId). El token anterior deja de ser válido.
  async rotate(sessionId: string, newRefreshTokenHash: string): Promise<Session> {
    const expiresAt = new Date(Date.now() + this.env.JWT_REFRESH_TTL * 1000);
    return this.prisma.client.session.update({
      where: { id: sessionId },
      data: { refreshTokenHash: newRefreshTokenHash, expiresAt, lastUsedAt: new Date() },
    });
  }

  async setOrganization(sessionId: string, organizationId: string): Promise<void> {
    await this.prisma.client.session.update({
      where: { id: sessionId },
      data: { organizationId },
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  listActive(userId: string) {
    return this.prisma.client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        device: true,
        createdAt: true,
        lastUsedAt: true,
        organizationId: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }
}
