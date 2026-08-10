import { Inject, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy, type StrategyOptionsWithoutRequest } from "passport-jwt";
import type { Request } from "express";
import type { Env } from "@24hits/config";
import { ENV } from "../config/app-config.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AppException } from "../common/errors/app-exception.js";
import type { AuthContext } from "../common/context/request-context.js";

// Payload del access token.
export interface AccessTokenPayload {
  sub: string; // userId
  sid: string; // sessionId
  org?: string; // organizationId activo
  mbr?: string; // membershipId activo
}

// Lee el access token de la cookie httpOnly (web) o del header Bearer (clientes API).
function cookieExtractor(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.access_token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService
  ) {
    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: env.JWT_ACCESS_SECRET,
      ignoreExpiration: false,
    };
    super(options);
  }

  // Valida el token Y el estado de la sesión/usuario en cada request, para que la
  // revocación de sesión y la desactivación de usuario surtan efecto de inmediato
  // (no esperar a que expire el access token). Ver ADR-005.
  async validate(payload: AccessTokenPayload): Promise<AuthContext> {
    const session = await this.prisma.client.session.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { status: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw AppException.unauthorized("Sesión inválida o revocada");
    }
    if (session.userId !== payload.sub || session.user.status !== "ACTIVE") {
      throw AppException.unauthorized("Usuario no activo");
    }

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      organizationId: payload.org,
      membershipId: payload.mbr,
    };
  }
}
