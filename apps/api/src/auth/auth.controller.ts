import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { Env } from "@24hits/config";
import { ENV } from "../config/app-config.module.js";
import { Public } from "../common/decorators/public.decorator.js";
import { RateLimit } from "../common/decorators/rate-limit.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { AppException } from "../common/errors/app-exception.js";
import { AuthService, type IssuedTokens } from "./auth.service.js";
import { OrganizationService } from "../iam/organization.service.js";
import { selectOrganizationSchema } from "../iam/iam.dto.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from "./auth.dto.js";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly organizations: OrganizationService,
    @Inject(ENV) private readonly env: Env
  ) {}

  @Public()
  @RateLimit({ limit: 5, windowSec: 300 })
  @Post("register")
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput
  ): Promise<{ userId: string }> {
    return this.auth.register(body);
  }

  @Public()
  @Post("verify-email")
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    return this.auth.verifyEmail(body.token);
  }

  // Reenvía el correo de verificación al usuario autenticado (rate-limited).
  @RateLimit({ limit: 3, windowSec: 600 })
  @Post("resend-verification")
  resendVerification(@CurrentUser() u: AuthContext) {
    return this.auth.resendVerification(u.userId);
  }

  @Public()
  @RateLimit({ limit: 10, windowSec: 60 })
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ needsOrgSelection: boolean }> {
    const result = await this.auth.login(body);
    this.setAuthCookies(res, result);
    return { needsOrgSelection: result.needsOrgSelection };
  }

  @Post("select-organization")
  async selectOrganization(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(selectOrganizationSchema))
    body: { organizationId: string },
    @Res({ passthrough: true }) res: Response
  ): Promise<{ ok: boolean }> {
    const { accessToken } = await this.auth.selectOrganization(
      user.userId,
      user.sessionId,
      body.organizationId
    );
    this.setAccessCookie(res, accessToken);
    return { ok: true };
  }

  @Public()
  @Post("refresh")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ ok: boolean }> {
    const token = this.readCookie(req, REFRESH_COOKIE) ?? (req.body?.refreshToken as string | undefined);
    if (!token) throw AppException.unauthorized("Falta el refresh token");
    const tokens = await this.auth.refresh(token);
    this.setAuthCookies(res, tokens);
    return { ok: true };
  }

  @Post("logout")
  async logout(
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ ok: boolean }> {
    await this.auth.logout(user.sessionId);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Post("logout-all")
  async logoutAll(
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ ok: boolean }> {
    await this.auth.logoutAll(user.userId);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Get("sessions")
  sessions(@CurrentUser() user: AuthContext) {
    return this.auth.listSessions(user.userId);
  }

  @Delete("sessions/:id")
  async revokeSession(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string
  ): Promise<{ ok: boolean }> {
    await this.auth.revokeSession(user.userId, id);
    return { ok: true };
  }

  @Public()
  @RateLimit({ limit: 5, windowSec: 900 })
  @Post("forgot-password")
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput
  ): Promise<{ ok: boolean }> {
    await this.auth.forgotPassword(body);
    // Respuesta genérica: no revela si el correo existe.
    return { ok: true };
  }

  @Public()
  @RateLimit({ limit: 5, windowSec: 900 })
  @Post("reset-password")
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput
  ): Promise<{ ok: boolean }> {
    await this.auth.resetPassword(body);
    return { ok: true };
  }

  // --- Helpers de cookies ---

  private cookieBase() {
    const sameSite = this.env.COOKIE_SAMESITE;
    return {
      httpOnly: true,
      // SameSite=None exige Secure (requisito del navegador para cookies cross-site).
      secure: this.env.NODE_ENV === "production" || sameSite === "none",
      sameSite,
      domain: this.env.COOKIE_DOMAIN,
      path: "/",
    };
  }

  private setAccessCookie(res: Response, accessToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...this.cookieBase(),
      maxAge: this.env.JWT_ACCESS_TTL * 1000,
    });
  }

  private setAuthCookies(res: Response, tokens: IssuedTokens): void {
    this.setAccessCookie(res, tokens.accessToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieBase(),
      maxAge: this.env.JWT_REFRESH_TTL * 1000,
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, this.cookieBase());
    res.clearCookie(REFRESH_COOKIE, this.cookieBase());
  }

  private readCookie(req: Request, name: string): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[name];
  }
}
