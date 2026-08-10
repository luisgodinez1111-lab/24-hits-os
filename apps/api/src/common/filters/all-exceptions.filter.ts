import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from "@nestjs/common";
import type { Response } from "express";
import type { Logger } from "@24hits/observability";
import { RequestContext } from "../context/request-context.js";
import { ErrorCode, type ErrorCodeValue } from "../errors/error-codes.js";
import { LOGGER } from "../../observability/observability.module.js";

// Formato de error estándar. NUNCA filtra stack traces, SQL ni detalles internos.
// { error: { code, message, details }, correlationId }
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId = RequestContext.correlationId() ?? null;

    let status = 500;
    let code: ErrorCodeValue = ErrorCode.INTERNAL;
    let message = "Error interno del servidor";
    let details: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        message = payload;
      } else if (payload && typeof payload === "object") {
        const p = payload as Record<string, unknown>;
        code = (p.code as ErrorCodeValue) ?? statusToCode(status);
        message = typeof p.message === "string" ? p.message : message;
        details = p.details ?? null;
      }
      if (code === ErrorCode.INTERNAL) code = statusToCode(status);
    }

    // 5xx: registrar con detalle server-side, pero NO exponerlo al cliente.
    if (status >= 500) {
      this.logger.error("Excepción no controlada", {
        correlationId,
        message: exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
      message = "Error interno del servidor";
      details = null;
    }

    res.status(status).json({ error: { code, message, details }, correlationId });
  }
}

function statusToCode(status: number): ErrorCodeValue {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_ERROR;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return ErrorCode.INTERNAL;
  }
}
