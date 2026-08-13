import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { PosService } from "./pos.service.js";
import { posLookupSchema, posSaleSchema, type PosLookupInput, type PosSaleInput } from "./pos.dto.js";

@ApiTags("pos")
@Controller("pos")
export class PosController {
  constructor(private readonly pos: PosService) {}

  // Escaneo: resuelve el código de barras a la variante (precio + disponible).
  @Get("lookup")
  @RequirePermissions("orders.create")
  lookup(@CurrentUser() u: AuthContext, @Query(new ZodValidationPipe(posLookupSchema)) q: PosLookupInput) {
    return this.pos.lookup(u.organizationId!, q);
  }

  // Venta de mostrador completa en una operación.
  @Post("sale")
  @RequirePermissions("orders.create", "orders.fulfill", "payments.record")
  sale(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(posSaleSchema)) b: PosSaleInput) {
    return this.pos.sale(u.organizationId!, u.userId, b);
  }
}
