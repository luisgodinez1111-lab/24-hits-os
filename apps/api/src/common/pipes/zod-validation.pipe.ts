import { type PipeTransform } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";
import { AppException } from "../errors/app-exception.js";

// Valida el payload contra un esquema Zod. Estrategia única de validación (ADR:
// nunca confiar en TypeScript en runtime). Acepta esquemas con `transform`
// (input distinto del output). Los errores salen en formato estándar.
export class ZodValidationPipe<Output> implements PipeTransform<unknown, Output> {
  constructor(private readonly schema: ZodType<Output, ZodTypeDef, unknown>) {}

  transform(value: unknown): Output {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw AppException.badRequest("Datos inválidos", result.error.flatten());
    }
    return result.data;
  }
}
