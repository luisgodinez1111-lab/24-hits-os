// Abstracción de envío de correo. Desacopla del proveedor concreto (Resend, SES,
// Postmark…). En desarrollo se usa ConsoleEmailProvider.

export interface EmailMessage {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
