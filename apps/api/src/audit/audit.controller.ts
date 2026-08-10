import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { AuditService } from "./audit.service.js";
import { auditQuerySchema, type AuditQuery } from "./audit.dto.js";

@ApiTags("audit")
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get("events")
  @RequirePermissions("audit.read")
  list(
    @CurrentUser() user: AuthContext,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery
  ) {
    return this.audit.list(user.organizationId!, query);
  }
}
