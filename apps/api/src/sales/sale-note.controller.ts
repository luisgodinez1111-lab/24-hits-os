import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { SaleNoteService } from "./sale-note.service.js";
import {
  cancelSaleNoteSchema,
  issueSaleNoteSchema,
  type CancelSaleNoteInput,
  type IssueSaleNoteInput,
} from "./sale-note.dto.js";

@ApiTags("sale-notes")
@Controller("sale-notes")
export class SaleNoteController {
  constructor(private readonly notes: SaleNoteService) {}

  @Get()
  @RequirePermissions("sales.note.read")
  list(@CurrentUser() u: AuthContext) {
    return this.notes.list(u.organizationId!);
  }

  @Get(":id")
  @RequirePermissions("sales.note.read")
  get(@CurrentUser() u: AuthContext, @Param("id") id: string) {
    return this.notes.get(u.organizationId!, id);
  }

  @Post()
  @RequirePermissions("sales.note.issue")
  issue(@CurrentUser() u: AuthContext, @Body(new ZodValidationPipe(issueSaleNoteSchema)) b: IssueSaleNoteInput) {
    return this.notes.issue(u.organizationId!, u.userId, b);
  }

  @Post(":id/cancel")
  @RequirePermissions("sales.note.cancel")
  cancel(@CurrentUser() u: AuthContext, @Param("id") id: string, @Body(new ZodValidationPipe(cancelSaleNoteSchema)) b: CancelSaleNoteInput) {
    return this.notes.cancel(u.organizationId!, u.userId, id, b);
  }
}
