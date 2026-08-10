import type { Env } from "@24hits/config";
import type { Logger } from "@24hits/observability";
import type { EmailProvider } from "./email-provider.js";
import { ConsoleEmailProvider } from "./console-email-provider.js";
import { ResendEmailProvider } from "./resend-email-provider.js";

// Selecciona el proveedor de correo según configuración. Los proveedores reales
// implementan EmailProvider, así que se añaden aquí sin tocar los call sites.
export function createEmailProvider(env: Env, logger: Logger): EmailProvider {
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) {
      logger.warn("EMAIL_PROVIDER=resend pero falta RESEND_API_KEY; usando consola.");
      return new ConsoleEmailProvider(logger, env.EMAIL_FROM);
    }
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM, logger);
  }
  return new ConsoleEmailProvider(logger, env.EMAIL_FROM);
}
