import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import type { AccessTokenPayload } from "./jwt.strategy.js";

export interface GeneratedRefreshToken {
  token: string; // se entrega al cliente (cookie httpOnly)
  tokenHash: string; // se persiste (nunca el token en claro)
}

// Emite access tokens (JWT firmado, corto) y refresh tokens opacos (alta entropía).
// El refresh se guarda solo como hash SHA-256 (ADR-005).
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    // secret y expiración vienen de la configuración del JwtModule.
    return this.jwt.signAsync(payload);
  }

  generateRefreshToken(): GeneratedRefreshToken {
    const token = randomBytes(48).toString("base64url");
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
