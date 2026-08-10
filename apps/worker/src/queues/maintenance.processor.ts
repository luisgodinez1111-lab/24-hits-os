import { Queue, Worker, type Job } from "bullmq";
import type { Logger } from "@24hits/observability";
import type { ExtendedPrismaClient } from "@24hits/database";
import { expireReservations } from "../inventory/expire-reservations.js";
import { verifyInventoryDrift } from "../inventory/verify-drift.js";
import type { RedisConnection } from "./email.processor.js";

export const MAINTENANCE_QUEUE_NAME = "maintenance";
export const JOB_RESERVATION_EXPIRE = "reservation.expire";
export const JOB_BALANCE_VERIFY = "inventory.balance.verify";

// Programa los jobs repetibles (cron) y arranca el worker de mantenimiento de inventario.
export async function startMaintenanceWorker(params: {
  connection: RedisConnection;
  logger: Logger;
  prisma: ExtendedPrismaClient;
}): Promise<{ worker: Worker; queue: Queue }> {
  const { connection, logger, prisma } = params;

  const queue = new Queue(MAINTENANCE_QUEUE_NAME, { connection });
  // Expiración de reservas cada 60s; verificación de drift cada 5 min.
  await queue.add(JOB_RESERVATION_EXPIRE, {}, { repeat: { every: 60_000 }, jobId: "reservation-expire", removeOnComplete: 100, removeOnFail: 100 });
  await queue.add(JOB_BALANCE_VERIFY, {}, { repeat: { every: 300_000 }, jobId: "balance-verify", removeOnComplete: 100, removeOnFail: 100 });

  const worker = new Worker(
    MAINTENANCE_QUEUE_NAME,
    async (job: Job) => {
      if (job.name === JOB_RESERVATION_EXPIRE) {
        await expireReservations(prisma, logger);
        return;
      }
      if (job.name === JOB_BALANCE_VERIFY) {
        await verifyInventoryDrift(prisma, logger);
        return;
      }
      logger.warn("Job de mantenimiento desconocido", { name: job.name });
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    logger.error("Job de mantenimiento fallido", { jobId: job?.id ?? null, error: err.message });
  });
  return { worker, queue };
}
