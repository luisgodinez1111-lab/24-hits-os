import { Global, Module } from "@nestjs/common";
import type { Env } from "@24hits/config";
import { S3FileStorageProvider, type FileStorageProvider } from "@24hits/storage";
import { ENV } from "../config/app-config.module.js";
import { FilesController } from "./files.controller.js";
import { FILE_STORAGE } from "./storage.tokens.js";

export { FILE_STORAGE } from "./storage.tokens.js";

@Global()
@Module({
  providers: [
    {
      provide: FILE_STORAGE,
      inject: [ENV],
      useFactory: (env: Env): FileStorageProvider =>
        new S3FileStorageProvider({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKey: env.S3_ACCESS_KEY,
          secretKey: env.S3_SECRET_KEY,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        }),
    },
  ],
  controllers: [FilesController],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
