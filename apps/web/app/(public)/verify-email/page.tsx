"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Card, CardBody, Spinner } from "@24hits/ui";
import { api } from "@/lib/api";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    api
      .post("/auth/verify-email", { token })
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <Card>
      <CardBody>
        {state === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <Spinner /> Verificando…
          </p>
        ) : state === "ok" ? (
          <Alert tone="success" title="Correo verificado">
            Tu correo fue verificado. Ya puedes iniciar sesión.
          </Alert>
        ) : (
          <Alert tone="error" title="No se pudo verificar">
            El enlace es inválido o expiró.
          </Alert>
        )}
        <Link href="/login" className="mt-4 block text-center text-sm text-brand">
          Ir a iniciar sesión
        </Link>
      </CardBody>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
