import "reflect-metadata";
import type { IncomingMessage, ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { loadEnv } from "@24hits/config";
import { AppModule } from "./app.module.js";

// Handler de Node (Express es compatible con esta firma).
export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

// La app se crea UNA vez y se reutiliza entre invocaciones (Fluid Compute reusa la
// instancia). No hace listen(): en serverless Vercel entrega la request al handler.
let cached: NodeHandler | null = null;

export async function createServer(): Promise<NodeHandler> {
  if (cached) return cached;

  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(helmet());
  app.use(cookieParser());
  // APP_URL = origen del frontend (para CORS con credenciales / cookies cross-site).
  app.enableCors({ origin: env.APP_URL, credentials: true });
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready"] });

  await app.init();

  cached = app.getHttpAdapter().getInstance() as NodeHandler;
  return cached;
}
