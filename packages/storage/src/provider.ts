// Abstracción de almacenamiento de archivos. Evita acoplarse a un proveedor
// concreto (MinIO en dev, S3-compatible en prod). Los archivos son PRIVADOS:
// el acceso se hace siempre con URLs firmadas de vida corta.

export interface SignedUploadOptions {
  contentType?: string;
  expiresInSec?: number;
}

export interface SignedDownloadOptions {
  expiresInSec?: number;
}

export interface FileStorageProvider {
  // URL firmada para SUBIR un objeto (PUT).
  getSignedUploadUrl(key: string, options?: SignedUploadOptions): Promise<string>;
  // URL firmada para DESCARGAR un objeto (GET).
  getSignedDownloadUrl(key: string, options?: SignedDownloadOptions): Promise<string>;
  // Tamaño real (bytes) del objeto, o null si no existe. Para validar el peso SUBIDO
  // (el PUT firmado no puede limitar bytes; esto verifica lo que realmente llegó).
  objectSize(key: string): Promise<number | null>;
  // Elimina un objeto.
  remove(key: string): Promise<void>;
}
