import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import Redis from "ioredis";
import { REDIS } from "../../redis/redis.module.js";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "../decorators/rate-limit.decorator.js";
import { AppException } from "../errors/app-exception.js";
import { ErrorCode } from "../errors/error-codes.js";

// Rate limiting distribuido (Redis) por IP+ruta. Protege endpoints sensibles
// (login, registro, recuperación). Ventana fija con INCR + EXPIRE.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const forwarded = req.header("x-forwarded-for");
    const ip = (forwarded ? forwarded.split(",")[0] : undefined)?.trim() || req.ip || "unknown";
    const routeKey = `${req.method}:${req.baseUrl}${req.path}`;
    const key = `ratelimit:${routeKey}:${ip}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.windowSec);
    }
    if (count > options.limit) {
      throw new AppException(
        429,
        ErrorCode.RATE_LIMITED,
        "Demasiadas solicitudes. Intenta de nuevo más tarde."
      );
    }
    return true;
  }
}
