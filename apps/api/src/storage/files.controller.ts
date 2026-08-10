import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { newId } from "@24hits/shared";
import type { FileStorageProvider } from "@24hits/storage";
import { FILE_STORAGE } from "./storage.tokens.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AuthContext } from "../common/context/request-context.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { AppException } from "../common/errors/app-exception.js";
import {
  downloadUrlSchema,
  uploadUrlSchema,
  type DownloadUrlInput,
  type UploadUrlInput,
} from "./files.dto.js";

// Archivos privados con URLs firmadas. Las claves se prefijan por organización
// (`org/<orgId>/…`) → aislamiento de tenant también en la capa de almacenamiento.
@ApiTags("files")
@Controller("files")
export class FilesController {
  constructor(@Inject(FILE_STORAGE) private readonly storage: FileStorageProvider) {}

  private orgPrefix(user: AuthContext): string {
    if (!user.organizationId) {
      throw AppException.forbidden("Selecciona una organización para gestionar archivos");
    }
    return `org/${user.organizationId}`;
  }

  @Post("upload-url")
  async uploadUrl(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(uploadUrlSchema)) body: UploadUrlInput
  ): Promise<{ key: string; url: string }> {
    const key = `${this.orgPrefix(user)}/${newId()}/${body.filename}`;
    const url = await this.storage.getSignedUploadUrl(key, {
      contentType: body.contentType,
    });
    return { key, url };
  }

  @Post("download-url")
  async downloadUrl(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(downloadUrlSchema)) body: DownloadUrlInput
  ): Promise<{ url: string }> {
    const prefix = this.orgPrefix(user);
    // La clave debe pertenecer a la organización activa (no-enumeración cruzada).
    if (!body.key.startsWith(`${prefix}/`)) {
      throw AppException.notFound("Archivo no encontrado");
    }
    const url = await this.storage.getSignedDownloadUrl(body.key);
    return { url };
  }
}
