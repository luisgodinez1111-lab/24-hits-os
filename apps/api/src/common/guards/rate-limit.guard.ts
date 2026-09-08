import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import Redis from "ioredis";
import type { Env } from "@24hits/config";
import { REDIS } from "../../redis/redis.module.js";
import { ENV } from "../../config/app-config.module.js";
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY, type RateLimitOptions } from "../decorators/rate-limit.decorator.js";
import { AppException } from "../errors/app-exception.js";
import { ErrorCode } from "../errors/error-codes.js";

// Rate limiting distribuido (Redis) por IP+ruta. TODO endpoint tiene un tope por
// defecto (RATE_LIMIT_DEFAULT); los sensibles (login, bulk, etc.) lo endurecen con
// @RateLimit, y @SkipRateLimit exime (health checks). Ventana fija con INCR + EXPIRE.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)) return true;

    // Límite propio del endpoint, o el tope por defecto para todos los demás.
    const options: RateLimitOptions =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, targets) ?? {
        limit: this.env.RATE_LIMIT_DEFAULT,
        windowSec: this.env.RATE_LIMIT_WINDOW_SEC,
      };

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
