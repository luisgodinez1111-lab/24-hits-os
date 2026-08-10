// Render mínimo de plantillas de correo a HTML. Centralizado para que todos los
// proveedores (Console, Resend) produzcan el mismo contenido.

const TITLES: Record<string, { title: string; cta: string; intro: string }> = {
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

export function renderEmail(template: string, data: Record<string, unknown>): string {
  const meta = TITLES[template] ?? {
    title: "24 HITS OS",
    intro: "",
    cta: "Abrir",
  };
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
