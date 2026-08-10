import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import Redis from "ioredis";
import { Public } from "../common/decorators/public.decorator.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";

// Liveness (/health): responde rápido sin tocar dependencias.
// Readiness (/ready): verifica que base de datos y Redis responden.
@ApiTags("health")
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  @Public()
  @Get("health")
  health(): { status: string; ts: string } {
    return { status: "ok", ts: new Date().toISOString() };
  }

  @Public()
  @Get("ready")
  async ready(): Promise<{ status: string; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }
    try {
      const pong = await this.redis.ping();
      checks.redis = pong === "PONG" ? "ok" : "error";
    } catch {
      checks.redis = "error";
    }
    const status = Object.values(checks).every((v) => v === "ok") ? "ready" : "degraded";
    return { status, checks };
  }
}
