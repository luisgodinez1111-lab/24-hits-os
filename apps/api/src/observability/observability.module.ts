import { Global, Module } from "@nestjs/common";
import type { Env } from "@24hits/config";
import { createLogger, type Logger } from "@24hits/observability";
import { ENV } from "../config/app-config.module.js";

// Token de inyección del logger estructurado.
export const LOGGER = Symbol("LOGGER");

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      inject: [ENV],
      useFactory: (env: Env): Logger =>
        createLogger({
          service: env.OTEL_SERVICE_NAME,
          minLevel: env.NODE_ENV === "development" ? "debug" : "info",
          base: { env: env.NODE_ENV },
        }),
    },
  ],
  exports: [LOGGER],
})
export class ObservabilityModule {}
