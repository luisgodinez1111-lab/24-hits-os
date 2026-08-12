import { Worker, type Job } from "bullmq";
import type { RedisConnectionOptions } from "@24hits/config";
import type { Logger } from "@24hits/observability";
import type { EmailProvider } from "../email/email-provider.js";

// Nombre de la cola (debe coincidir con el productor en apps/api).
export const EMAIL_QUEUE_NAME = "email";

interface EmailSendData {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
  correlationId?: string;
}

// Conexión Redis compartida (soporta TLS/credenciales de Upstash).
export type RedisConnection = RedisConnectionOptions;

// Arranca el worker de la cola de emails. Procesa jobs `email.send` con el
// proveedor de correo inyectado. Propaga correlationId a los logs.
export function startEmailWorker(params: {
  connection: RedisConnection;
  logger: Logger;
  emailProvider: EmailProvider;
}): Worker {
  const { connection, logger, emailProvider } = params;

  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as EmailSendData;
      const log = logger.child({
        jobId: job.id ?? "unknown",
        correlationId: data.correlationId ?? null,
      });

      if (job.name === "email.send") {
        await emailProvider.send({
          to: data.to,
          subject: data.subject,
          template: data.template,
          data: data.data,
        });
        log.info("email.send procesado", { to: data.to, template: data.template });
        return;
      }

      log.warn("Job desconocido en cola email", { name: job.name });
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    logger.error("Job fallido", { jobId: job?.id ?? null, error: err.message });
  });
  worker.on("completed", (job) => {
    logger.debug("Job completado", { jobId: job.id });
  });

  return worker;
}
