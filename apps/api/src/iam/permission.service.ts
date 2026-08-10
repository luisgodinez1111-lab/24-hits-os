import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service.js";
import { REDIS } from "../redis/redis.module.js";

const CACHE_TTL_SEC = 300;

// Resuelve los permisos efectivos de una membresía (unión de permisos de sus roles).
// Cachea el resultado en Redis; se invalida al cambiar los roles de la membresía.
@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  private cacheKey(membershipId: string): string {
    return `perm:membership:${membershipId}`;
  }

  async getPermissionKeys(membershipId: string): Promise<Set<string>> {
    const cached = await this.redis.get(this.cacheKey(membershipId));
    if (cached) return new Set(JSON.parse(cached) as string[]);

    const rows = await this.prisma.client.membershipRole.findMany({
      where: { membershipId },
      select: {
        role: {
          select: { permissions: { select: { permission: { select: { key: true } } } } },
        },
      },
    });

    const keys = new Set<string>();
    for (const row of rows) {
      for (const rp of row.role.permissions) keys.add(rp.permission.key);
    }

    await this.redis.set(
      this.cacheKey(membershipId),
      JSON.stringify([...keys]),
      "EX",
      CACHE_TTL_SEC
    );
    return keys;
  }

  async can(membershipId: string, required: string[]): Promise<boolean> {
    const keys = await this.getPermissionKeys(membershipId);
    return required.every((k) => keys.has(k));
  }

  async invalidate(membershipId: string): Promise<void> {
    await this.redis.del(this.cacheKey(membershipId));
  }
}
