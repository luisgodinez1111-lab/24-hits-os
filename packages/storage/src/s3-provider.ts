import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  FileStorageProvider,
  SignedDownloadOptions,
  SignedUploadOptions,
} from "./provider.js";

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean; // true para MinIO
}

const DEFAULT_EXPIRY_SEC = 300;

// Implementación S3-compatible (funciona con AWS S3 y MinIO). Bucket privado:
// nunca se sirven URLs públicas, solo firmadas y de corta duración.
export class S3FileStorageProvider implements FileStorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  getSignedUploadUrl(key: string, options?: SignedUploadOptions): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: options?.contentType,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options?.expiresInSec ?? DEFAULT_EXPIRY_SEC,
    });
  }

  getSignedDownloadUrl(key: string, options?: SignedDownloadOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options?.expiresInSec ?? DEFAULT_EXPIRY_SEC,
    });
  }

  async remove(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })
    );
  }
}
