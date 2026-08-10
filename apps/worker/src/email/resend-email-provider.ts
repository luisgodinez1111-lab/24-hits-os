import type { Logger } from "@24hits/observability";
import type { EmailMessage, EmailProvider } from "./email-provider.js";
import { renderEmail } from "./templates.js";

// Proveedor de producción vía Resend (https://resend.com). Implementa EmailProvider,
// así que es intercambiable con Console/SES sin tocar los call sites.
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly logger: Logger
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const html = renderEmail(message.template, message.data);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      this.logger.error("Resend: fallo al enviar correo", {
        status: res.status,
        to: message.to,
        body,
      });
      throw new Error(`Resend respondió ${res.status}`);
    }
    this.logger.info("Correo enviado (Resend)", { to: message.to, template: message.template });
  }
}
