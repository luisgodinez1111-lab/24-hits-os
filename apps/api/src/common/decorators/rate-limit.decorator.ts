import { SetMetadata } from "@nestjs/common";

export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitOptions {
  limit: number; // nº de solicitudes permitidas
  windowSec: number; // ventana en segundos
}

// Aplica rate limiting por IP+ruta a un endpoint (respaldado por Redis).
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

export const SKIP_RATE_LIMIT_KEY = "skipRateLimit";

// Exime a un endpoint del rate limit por defecto (p. ej. health checks de monitoreo).
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
