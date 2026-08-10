import { Global, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Inject, Injectable } from "@nestjs/common";
import Redis from "ioredis";
import type { Env } from "@24hits/config";
import { ENV } from "../config/app-config.module.js";

export const REDIS = Symbol("REDIS");

// Provee un cliente ioredis compartido (rate limiting, cache de permisos, etc.).
// Las colas BullMQ usan su propia conexión (ver módulo de colas).
@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly client: Redis) {}
  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env): Redis =>
        new Redis(env.REDIS_URL, {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
