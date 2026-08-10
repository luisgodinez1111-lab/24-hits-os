import { Global, Module } from "@nestjs/common";
import { loadEnv } from "@24hits/config";

// Token de inyección para la configuración validada.
export const ENV = Symbol("ENV");

// Carga y valida las variables de entorno una sola vez al arrancar.
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class AppConfigModule {}
