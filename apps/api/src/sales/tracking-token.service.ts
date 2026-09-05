import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "@24hits/config";
import { ENV } from "../config/app-config.module.js";

// Token de rastreo público para compartir con el cliente ("tu pedido va en camino").
// Es un HMAC-SHA256 firmado de {orgId, orderId} con el secreto del servidor → no
// requiere sesión ni tabla/campo extra en la DB, y no es adivinable. Formato:
//   base64url(orgId.orderId) . base64url(hmac)
@Injectable()
export class TrackingTokenService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private sig(payload: string): Buffer {
    return createHmac("sha256", this.env.JWT_ACCESS_SECRET).update(payload).digest();
  }

  sign(orgId: string, orderId: string): string {
    const payload = `${orgId}.${orderId}`;
    return `${Buffer.from(payload).toString("base64url")}.${this.sig(payload).toString("base64url")}`;
  }

  verify(token: string): { orgId: string; orderId: string } | null {
    const [p, s] = token.split(".");
    if (!p || !s) return null;
    let payload: string;
    try {
      payload = Buffer.from(p, "base64url").toString("utf8");
    } catch {
      return null;
    }
    // Comparación en tiempo constante para no filtrar la firma correcta.
    const a = Buffer.from(s);
    const b = Buffer.from(this.sig(payload).toString("base64url"));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // orgId y orderId son UUID (sin puntos): el primer punto separa ambos.
    const dot = payload.indexOf(".");
    if (dot < 0) return null;
    return { orgId: payload.slice(0, dot), orderId: payload.slice(dot + 1) };
  }
}
