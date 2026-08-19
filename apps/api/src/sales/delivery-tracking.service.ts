import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS } from "../redis/redis.module.js";
import { PrismaService } from "../prisma/prisma.service.js";

const FRESH_MS = 5 * 60 * 1000; // ubicación válida por 5 min
const HASH_TTL_SEC = 24 * 60 * 60; // el hash del org expira tras 1 día inactivo

interface Loc {
  lat: number;
  lng: number;
  ts: number;
}

export interface LiveDriver {
  userId: string;
  name: string;
  lat: number;
  lng: number;
  ts: number;
  minutesAgo: number;
}

// Seguimiento en vivo del repartidor. El repartidor emite su GPS periódicamente
// (se guarda en Redis por usuario con marca de tiempo); el dueño lo consulta.
// Patrón poll (no WebSocket) → robusto en serverless. Ubicaciones viejas (>5 min)
// se filtran y limpian solas.
@Injectable()
export class DeliveryTrackingService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService
  ) {}

  private key(orgId: string): string {
    return `hits:drivers:${orgId}`;
  }

  async report(organizationId: string, userId: string, lat: number, lng: number): Promise<void> {
    const val: Loc = { lat, lng, ts: Date.now() };
    await this.redis.hset(this.key(organizationId), userId, JSON.stringify(val));
    await this.redis.expire(this.key(organizationId), HASH_TTL_SEC);
  }

  async live(organizationId: string): Promise<LiveDriver[]> {
    const all = await this.redis.hgetall(this.key(organizationId));
    const now = Date.now();
    const fresh: Array<{ userId: string; loc: Loc }> = [];
    const stale: string[] = [];
    for (const [userId, raw] of Object.entries(all)) {
      try {
        const loc = JSON.parse(raw) as Loc;
        if (now - loc.ts > FRESH_MS) stale.push(userId);
        else fresh.push({ userId, loc });
      } catch {
        stale.push(userId);
      }
    }
    if (stale.length > 0) await this.redis.hdel(this.key(organizationId), ...stale).catch(() => undefined);
    if (fresh.length === 0) return [];

    const users = await this.prisma.client.user.findMany({
      where: { id: { in: fresh.map((f) => f.userId) } },
      select: { id: true, name: true, email: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Repartidor"]));

    return fresh
      .map(({ userId, loc }) => ({
        userId,
        name: nameById.get(userId) ?? "Repartidor",
        lat: loc.lat,
        lng: loc.lng,
        ts: loc.ts,
        minutesAgo: Math.round((now - loc.ts) / 60000),
      }))
      .sort((a, b) => a.ts - b.ts);
  }
}
