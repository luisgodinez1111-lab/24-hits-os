import {
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { RequestContext, type AuthContext } from "../context/request-context.js";
import { AppException } from "../errors/app-exception.js";

// Autentica con la estrategia JWT salvo que el endpoint sea @Public().
// Al validar, publica la identidad en el RequestContext para el resto del pipeline.
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser = AuthContext>(
    err: unknown,
    user: TUser | false,
    _info: unknown
  ): TUser {
    if (err || !user) {
      throw AppException.unauthorized();
    }
    RequestContext.setAuth(user as unknown as AuthContext);
    return user;
  }
}
