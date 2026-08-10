import { HttpException } from "@nestjs/common";
import { ErrorCode, type ErrorCodeValue } from "./error-codes.js";

// Excepción de dominio con código estable + status HTTP. El filtro global la
// traduce al formato de error estándar.
export class AppException extends HttpException {
  constructor(
    status: number,
    public readonly code: ErrorCodeValue,
    message: string,
    public readonly details: unknown = null
  ) {
    super({ code, message, details }, status);
  }

  static badRequest(message: string, details: unknown = null): AppException {
    return new AppException(400, ErrorCode.VALIDATION_ERROR, message, details);
  }
  static unauthorized(message = "No autenticado"): AppException {
    return new AppException(401, ErrorCode.UNAUTHORIZED, message);
  }
  static forbidden(message = "No tienes permiso para realizar esta acción"): AppException {
    return new AppException(403, ErrorCode.FORBIDDEN, message);
  }
  static notFound(message = "Recurso no encontrado"): AppException {
    return new AppException(404, ErrorCode.NOT_FOUND, message);
  }
  static conflict(message: string): AppException {
    return new AppException(409, ErrorCode.CONFLICT, message);
  }
}
