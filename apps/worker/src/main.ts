import { loadEnv } from "@24hits/config";
import { createLogger } from "@24hits/observability";
import { createPrismaClient } from "@24hits/database";
import { createEmailProvider } from "./email/factory.js";
import { EMAIL_QUEUE_NAME, startEmailWorker } from "./queues/email.processor.js";
import { MAINTENANCE_QUEUE_NAME, startMaintenanceWorker } from "./queues/maintenance.processor.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({
    service: "hits-worker",
    minLevel: env.NODE_ENV === "development" ? "debug" : "info",
    base: { env: env.NODE_ENV },
  });

  const emailProvider = createEmailProvider(env, logger);
  const url = new URL(env.REDIS_URL);
  const connection = { host: url.hostname, port: url.port ? Number(url.port) : 6379 };

  const prisma = createPrismaClient(env.DATABASE_URL);

  const emailWorker = startEmailWorker({ connection, logger, emailProvider });
  const maintenance = await startMaintenanceWorker({ connection, logger, prisma });

  logger.info("Worker de 24 HITS OS iniciado", {
    queues: [EMAIL_QUEUE_NAME, MAINTENANCE_QUEUE_NAME],
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Recibido ${signal}, cerrando worker...`);
    await emailWorker.close();
    await maintenance.worker.close();
    await maintenance.queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main();
