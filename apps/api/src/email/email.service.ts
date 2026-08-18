import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "@24hits/config";
import { createLogger, type Logger } from "@24hits/observability";
import { ENV } from "../config/app-config.module.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

// Metadatos por plantilla (título, intro, texto del botón).
const TEMPLATES: Record<string, { title: string; intro: string; cta: string }> = {
  "email-verification": {
    title: "Verifica tu correo",
    intro: "Confirma tu dirección para activar tu cuenta en 24 HITS OS.",
    cta: "Verificar correo",
  },
  "password-reset": {
    title: "Restablece tu contraseña",
    intro: "Recibimos una solicitud para restablecer tu contraseña.",
    cta: "Cambiar contraseña",
  },
  "member-invitation": {
    title: "Te invitaron a 24 HITS OS",
    intro: "Establece tu contraseña para acceder a la organización.",
    cta: "Aceptar invitación",
  },
};

function renderEmail(template: string, data: Record<string, unknown>): string {
  const meta = TEMPLATES[template] ?? { title: "24 HITS OS", intro: "", cta: "Abrir" };
  const url = typeof data.url === "string" ? data.url : "";
  return `<!doctype html>
<html lang="es"><body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;color:#111827">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
    <h1 style="font-size:18px;margin:0 0 8px">${meta.title}</h1>
    <p style="font-size:14px;color:#4b5563;margin:0 0 24px">${meta.intro}</p>
    ${url ? `<a href="${url}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">${meta.cta}</a>` : ""}
    <p style="font-size:12px;color:#9ca3af;margin:24px 0 0">24 HITS OS</p>
  </div>
</body></html>`;
}

// Envío de correo DIRECTO desde la API (sin worker). Con EMAIL_PROVIDER=resend +
// RESEND_API_KEY manda por Resend (fetch, sin SDK); si no, simula en consola
// (útil en dev para ver los enlaces de verificación/reset).
@Injectable()
export class EmailService {
  private readonly logger: Logger;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.logger = createLogger({
      service: "hits-api-email",
      minLevel: env.NODE_ENV === "development" ? "debug" : "info",
    });
  }

  async send(input: SendEmailInput): Promise<void> {
    const html = renderEmail(input.template, input.data);

    if (this.env.EMAIL_PROVIDER === "resend" && this.env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.env.EMAIL_FROM,
          to: input.to,
          subject: input.subject,
          html,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.error("Resend: fallo al enviar correo", { status: res.status, to: input.to, body });
        throw new Error(`Resend respondió ${res.status}`);
      }
      this.logger.info("Correo enviado (Resend)", { to: input.to, template: input.template });
      return;
    }

    this.logger.info("[email:console] correo simulado", {
      from: this.env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      template: input.template,
      data: input.data,
    });
  }
}
