import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { RequestContext, type AuthContext } from "../context/request-context.js";
import { AppException } from "../errors/app-exception.js";

// Inyecta el AuthContext de la request. Lanza 401 si no hay autenticación.
export const CurrentUser = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): AuthContext => {
    const auth = RequestContext.auth();
    if (!auth) throw AppException.unauthorized();
    return auth;
  }
);
