import type { ConnectionOptions as TlsOptions } from "node:tls";

// Opciones de conexión Redis para BullMQ/ioredis derivadas de una REDIS_URL.
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: TlsOptions;
  // Requisito de BullMQ para comandos bloqueantes (blocking): sin reintentos por request.
  maxRetriesPerRequest: null;
}

// Convierte una REDIS_URL en opciones de conexión completas. Soporta rediss:// (TLS,
// p.ej. Upstash) y credenciales embebidas (user:password@). Contra un Redis local
// sin auth/TLS (redis://) simplemente omite password y tls.
export function redisConnectionFromUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
