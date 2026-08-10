import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { ProductImageService } from "./product-image.service.js";
import {
  imageUploadUrlSchema,
  registerImageSchema,
  type ImageUploadUrlInput,
  type RegisterImageInput,
} from "./product-image.dto.js";

@ApiTags("product-images")
@Controller("products/:productId/images")
export class ProductImageController {
  constructor(private readonly images: ProductImageService) {}

  @Get()
  @RequirePermissions("products.read")
  list(@CurrentUser() u: AuthContext, @Param("productId") productId: string) {
    return this.images.list(u.organizationId!, productId);
  }

  @Post("upload-url")
  @RequirePermissions("products.update")
  uploadUrl(@CurrentUser() u: AuthContext, @Param("productId") productId: string, @Body(new ZodValidationPipe(imageUploadUrlSchema)) b: ImageUploadUrlInput) {
    return this.images.requestUploadUrl(u.organizationId!, productId, b);
  }

  @Post()
  @RequirePermissions("products.update")
  register(@CurrentUser() u: AuthContext, @Param("productId") productId: string, @Body(new ZodValidationPipe(registerImageSchema)) b: RegisterImageInput) {
    return this.images.register(u.organizationId!, productId, u.userId, b);
  }

  @Delete(":imageId")
  @RequirePermissions("products.update")
  async remove(@CurrentUser() u: AuthContext, @Param("imageId") imageId: string): Promise<{ ok: boolean }> {
    await this.images.remove(u.organizationId!, imageId);
    return { ok: true };
  }
}
