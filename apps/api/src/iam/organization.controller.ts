import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { OrganizationService } from "./organization.service.js";
import { bootstrapOrganizationSchema, type BootstrapOrganizationInput } from "./iam.dto.js";

@ApiTags("organizations")
@Controller("organizations")
export class OrganizationController {
  constructor(private readonly organizations: OrganizationService) {}

  // Crea la organización del usuario autenticado (se vuelve Owner). No requiere
  // permisos previos: es el punto de entrada al SaaS tras verificar el correo.
  @Post()
  async bootstrap(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(bootstrapOrganizationSchema))
    body: BootstrapOrganizationInput
  ) {
    const result = await this.organizations.bootstrapOrganization(user.userId, body);
    return {
      organization: result.organization,
      membershipId: result.membership.id,
      message: "Organización creada. Selecciona la organización para continuar.",
    };
  }

  @Get("me/memberships")
  memberships(@CurrentUser() user: AuthContext) {
    return this.organizations.getUserMemberships(user.userId);
  }
}
