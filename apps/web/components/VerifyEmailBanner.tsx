"use client";

import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { Button, useToast } from "@24hits/ui";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/me";

// Aviso para verificar el correo, con botón de reenvío. Se muestra solo si el
// usuario aún no verificó; se puede cerrar por la sesión.
export function VerifyEmailBanner() {
  const { data: me } = useMe();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (!me?.user || me.user.emailVerified || dismissed) return null;

  async function resend() {
    setSending(true);
    try {
      const r = await api.post<{ sent: boolean }>("/auth/resend-verification");
      toast.push(r.sent ? "Correo de verificación reenviado" : "Tu correo ya está verificado", "success");
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "No se pudo reenviar", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 sm:px-6">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Verifica tu correo <span className="font-medium">{me.user.email}</span> para asegurar tu cuenta.
      </span>
      <Button size="sm" variant="outline" loading={sending} onClick={resend}>Reenviar</Button>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Cerrar" className="text-amber-700 hover:text-amber-900">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
