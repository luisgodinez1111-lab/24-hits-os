import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "@24hits/config";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { QueueService } from "../queue/queue.service.js";
import { OrganizationService } from "../iam/organization.service.js";
import { RequestContext } from "../common/context/request-context.js";
import { AppException } from "../common/errors/app-exception.js";
import { ENV } from "../config/app-config.module.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";
import { SessionService } from "./session.service.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.dto.js";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly organizations: OrganizationService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    @Inject(ENV) private readonly env: Env
  ) {}

  // --- Registro + verificación de correo ---

  async register(input: RegisterInput): Promise<{ userId: string }> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict("No se pudo completar el registro");
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.client.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        passwordHash,
      },
      select: { id: true, email: true },
    });

    await this.sendEmailVerification(user.id, user.email);
    await this.audit.record({
      action: "user.registered",
      actorUserId: user.id,
      entityType: "User",
      entityId: user.id,
    });
    return { userId: user.id };
  }

  private async sendEmailVerification(userId: string, email: string): Promise<void> {
    const { token, tokenHash } = this.tokens.generateRefreshToken();
    await this.prisma.client.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
      },
    });
    await this.queue.enqueueEmail({
      to: email,
      subject: "Verifica tu correo — 24 HITS OS",
      template: "email-verification",
      data: { url: `${this.env.APP_URL}/verify-email?token=${token}` },
    });
  }

  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    const tokenHash = this.tokens.hashRefreshToken(token);
    const record = await this.prisma.client.emailVerificationToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) throw AppException.badRequest("Token inválido o expirado");

    await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.client.emailVerificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      action: "user.email_verified",
      actorUserId: record.userId,
      entityType: "User",
      entityId: record.userId,
    });
    return { verified: true };
  }

  // --- Login / sesiones ---

  async login(input: LoginInput): Promise<IssuedTokens & { needsOrgSelection: boolean }> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.client.user.findUnique({ where: { email } });

    if (!user) {
      await this.audit.record({ action: "auth.login.failure", metadata: { email, reason: "not_found" } });
      throw AppException.unauthorized("Credenciales inválidas");
    }
    if (user.status !== "ACTIVE") {
      await this.audit.record({
        action: "auth.login.failure",
        actorUserId: user.id,
        metadata: { reason: "disabled" },
      });
      throw AppException.unauthorized("Credenciales inválidas");
    }

    const ok = await this.passwords.verify(user.passwordHash, input.password);
    if (!ok) {
      await this.audit.record({
        action: "auth.login.failure",
        actorUserId: user.id,
        metadata: { reason: "bad_password" },
      });
      throw AppException.unauthorized("Credenciales inválidas");
    }

    // Auto-selección de organización si el usuario tiene exactamente una activa.
    const memberships = await this.organizations.getUserMemberships(user.id);
    const single = memberships.length === 1 ? memberships[0] : undefined;

    const { token: refreshToken, tokenHash } = this.tokens.generateRefreshToken();
    const store = RequestContext.get();
    const session = await this.sessions.create({
      userId: user.id,
      organizationId: single?.organization.id,
      refreshTokenHash: tokenHash,
      meta: { ip: store?.ip, userAgent: store?.userAgent },
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: session.id,
      org: single?.organization.id,
      mbr: single?.id,
    });

    await this.audit.record({
      action: "auth.login.success",
      actorUserId: user.id,
      organizationId: single?.organization.id,
    });

    return { accessToken, refreshToken, needsOrgSelection: !single };
  }

  // Selecciona la organización activa de la sesión y emite un access token con contexto.
  async selectOrganization(
    userId: string,
    sessionId: string,
    organizationId: string
  ): Promise<{ accessToken: string }> {
    const membership = await this.organizations.findActiveMembership(userId, organizationId);
    if (!membership) {
      // No confirmamos existencia de la organización a quien no es miembro.
      throw AppException.notFound("Organización no encontrada");
    }
    await this.sessions.setOrganization(sessionId, organizationId);
    const accessToken = await this.tokens.signAccessToken({
      sub: userId,
      sid: sessionId,
      org: organizationId,
      mbr: membership.id,
    });
    await this.audit.record({
      action: "auth.organization_selected",
      actorUserId: userId,
      organizationId,
    });
    return { accessToken };
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.sessions.findValidByHash(tokenHash);
    if (!session) throw AppException.unauthorized("Sesión inválida");

    // Verifica que el usuario siga activo.
    const user = await this.prisma.client.user.findUnique({
      where: { id: session.userId },
      select: { status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      throw AppException.unauthorized("Sesión inválida");
    }

    const { token: newRefresh, tokenHash: newHash } = this.tokens.generateRefreshToken();
    await this.sessions.rotate(session.id, newHash);

    let membershipId: string | undefined;
    if (session.organizationId) {
      const membership = await this.organizations.findActiveMembership(
        session.userId,
        session.organizationId
      );
      membershipId = membership?.id;
    }

    const accessToken = await this.tokens.signAccessToken({
      sub: session.userId,
      sid: session.id,
      org: session.organizationId ?? undefined,
      mbr: membershipId,
    });
    return { accessToken, refreshToken: newRefresh };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
    await this.audit.record({ action: "auth.logout" });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId);
    await this.audit.record({ action: "auth.logout_all", actorUserId: userId });
  }

  listSessions(userId: string) {
    return this.sessions.listActive(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.client.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) throw AppException.notFound("Sesión no encontrada");
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      action: "auth.session_revoked",
      actorUserId: userId,
      entityType: "Session",
      entityId: sessionId,
    });
  }

  // --- Recuperación de contraseña ---

  // Siempre responde igual, exista o no el correo (no revela cuentas registradas).
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) return;

    const { token, tokenHash } = this.tokens.generateRefreshToken();
    await this.prisma.client.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await this.queue.enqueueEmail({
      to: user.email,
      subject: "Restablece tu contraseña — 24 HITS OS",
      template: "password-reset",
      data: { url: `${this.env.APP_URL}/reset-password?token=${token}` },
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(input.token);
    const record = await this.prisma.client.passwordResetToken.findFirst({
      where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!record) throw AppException.badRequest("Token inválido o expirado");

    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.client.$transaction([
      this.prisma.client.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.client.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    // Fuerza cerrar todas las sesiones tras cambiar contraseña.
    await this.sessions.revokeAllForUser(record.userId);
    await this.audit.record({
      action: "auth.password_reset",
      actorUserId: record.userId,
      entityType: "User",
      entityId: record.userId,
    });
  }
}
