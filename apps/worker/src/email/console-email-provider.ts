import type { Logger } from "@24hits/observability";
import type { EmailMessage, EmailProvider } from "./email-provider.js";

// Proveedor de desarrollo: no envía nada, registra el correo en logs.
// Útil para ver enlaces de verificación/reset sin un proveedor real.
export class ConsoleEmailProvider implements EmailProvider {
  constructor(
    private readonly logger: Logger,
    private readonly from: string
  ) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.info("[email:console] correo simulado", {
      from: this.from,
      to: message.to,
      subject: message.subject,
      template: message.template,
      data: message.data,
    });
  }
}
