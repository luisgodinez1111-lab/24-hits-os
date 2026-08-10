import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

// Hashing de contraseñas con Argon2id (ADR-005). Parámetros por defecto de la
// librería (memory-hard); ajustables si se necesita más coste.
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash corrupto o formato inválido → tratamos como no coincidente.
      return false;
    }
  }
}
