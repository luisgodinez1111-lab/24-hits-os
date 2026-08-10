import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { RequestContext } from "../context/request-context.js";

const CORRELATION_HEADER = "x-correlation-id";

// Inicializa el contexto de la request: genera o propaga X-Correlation-ID y lo
// deja disponible (vía AsyncLocalStorage) para logs, errores, auditoría y jobs.
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_HEADER);
    const correlationId = incoming && incoming.trim() ? incoming.trim() : randomUUID();
    res.setHeader(CORRELATION_HEADER, correlationId);

    const forwarded = req.header("x-forwarded-for");
    const ip = (forwarded ? forwarded.split(",")[0] : undefined)?.trim() || req.ip;

    RequestContext.run(
      {
        correlationId,
        ip,
        userAgent: req.header("user-agent") ?? undefined,
      },
      () => next()
    );
  }
}
