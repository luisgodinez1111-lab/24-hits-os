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

// Distancia en km entre dos puntos (para elegir el repartidor más cercano + ETA).
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// Solo el primer nombre (privacidad hacia el cliente que ve el rastreo).
function firstName(s: string | null | undefined): string | null {
  return (s ?? "").trim().split(/\s+/)[0] || null;
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

  // El repartidor se declara fuera de línea: se borra su ubicación del hash, así
  // desaparece de inmediato del tablero del dueño (no espera a que expire por viejo).
  async goOffline(organizationId: string, userId: string): Promise<void> {
    await this.redis.hdel(this.key(organizationId), userId).catch(() => undefined);
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

  // Estado PÚBLICO de un pedido para el link de rastreo del cliente. Sin datos
  // sensibles (nada financiero): solo lo necesario para ver "tu pedido va en camino".
  // Repartidor = el más cercano a la entrega entre los que están en línea (default
  // sin asignación explícita pedido→repartidor).
  async publicOrderStatus(organizationId: string, orderId: string) {
    const order = await this.prisma.withTenant(organizationId, (tx) =>
      tx.order.findFirst({
        where: { id: orderId },
        select: {
          number: true,
          status: true,
          deliveryStatus: true,
          deliveryLat: true,
          deliveryLng: true,
          deliveryAddress: true,
          customer: { select: { name: true } },
        },
      })
    );
    if (!order) return null;

    const drivers = await this.live(organizationId);
    let driver: LiveDriver | null = null;
    if (order.deliveryLat != null && order.deliveryLng != null && drivers.length > 0) {
      driver = drivers.reduce((best, d) =>
        haversineKm(d.lat, d.lng, order.deliveryLat!, order.deliveryLng!) <
        haversineKm(best.lat, best.lng, order.deliveryLat!, order.deliveryLng!)
          ? d
          : best
      );
    } else {
      driver = drivers[0] ?? null;
    }

    const distKm =
      driver && order.deliveryLat != null && order.deliveryLng != null
        ? haversineKm(driver.lat, driver.lng, order.deliveryLat, order.deliveryLng)
        : null;
    // ETA con velocidad urbana promedio (~22 km/h, con paradas/semáforos).
    const etaMin = distKm != null ? Math.max(1, Math.round((distKm / 22) * 60)) : null;

    return {
      number: order.number,
      status: order.status,
      deliveryStatus: order.deliveryStatus,
      customerName: firstName(order.customer?.name),
      destination:
        order.deliveryLat != null && order.deliveryLng != null
          ? { lat: order.deliveryLat, lng: order.deliveryLng }
          : null,
      driver: driver
        ? { lat: driver.lat, lng: driver.lng, name: firstName(driver.name), minutesAgo: driver.minutesAgo }
        : null,
      etaMin,
    };
  }
}
