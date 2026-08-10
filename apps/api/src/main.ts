import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { loadEnv } from "@24hits/config";
import { initTelemetry, shutdownTelemetry } from "@24hits/observability";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  // Bootstrap de OpenTelemetry antes de crear la app (si hay colector configurado).
  initTelemetry({
    serviceName: env.OTEL_SERVICE_NAME,
    endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.APP_URL, credentials: true });

  // /health y /ready quedan en la raíz; el resto bajo /api/v1.
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready"] });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("24 HITS OS API")
    .setDescription("API del núcleo SaaS (auth, tenancy, RBAC, auditoría)")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/v1/docs", app, document);

  await app.listen(env.PORT);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Recibido ${signal}, cerrando...`);
    await app.close();
    await shutdownTelemetry();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Fallo al arrancar la API:", err);
  process.exit(1);
});
