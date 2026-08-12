import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { redisConnectionFromUrl, type Env } from "@24hits/config";
import { ENV } from "../config/app-config.module.js";
import { RequestContext } from "../common/context/request-context.js";

// Nombre de la cola de emails (compartido con el worker).
export const EMAIL_QUEUE_NAME = "email";
export const EMAIL_SEND_JOB = "email.send";

export interface SendEmailJob {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
  correlationId?: string;
}

// Productor de jobs. El API encola; el worker (apps/worker) procesa (ADR-009).
@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly emailQueue: Queue;

  constructor(@Inject(ENV) env: Env) {
    // Conexión completa (TLS + credenciales) desde REDIS_URL — necesario para Upstash.
    this.emailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection: redisConnectionFromUrl(env.REDIS_URL),
    });
  }

  async enqueueEmail(job: SendEmailJob): Promise<void> {
    await this.emailQueue.add(
      EMAIL_SEND_JOB,
      { ...job, correlationId: job.correlationId ?? RequestContext.correlationId() },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      }
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.emailQueue.close();
  }
}
