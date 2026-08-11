import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { CreditNoteService } from "./credit-note.service.js";
import { issueCreditNoteSchema, type IssueCreditNoteInput } from "./credit-note.dto.js";

@ApiTags("credit-notes")
@Controller("credit-notes")
export class CreditNoteController {
  constructor(private readonly credits: CreditNoteService) {}

  @Get()
  @RequirePermissions("sales.credit.read")
  list(@CurrentUser() u: AuthContext) {
    return this.credits.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("sales.credit.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.credits.get(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("sales.credit.issue")
  issue(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(issueCreditNoteSchema)) b: IssueCreditNoteInput) {
    return this.credits.issue(u.organizationId!, u.userId, b);
  }
}
