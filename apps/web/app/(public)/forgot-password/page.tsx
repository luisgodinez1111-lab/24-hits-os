"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Card, CardBody, FormField, Input } from "@24hits/ui";
import { api } from "@/lib/api";

const schema = z.object({ email: z.string().email("Correo inválido") });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    // La API siempre responde igual (sin revelar si el correo existe).
    await api.post("/auth/forgot-password", values).catch(() => undefined);
    setSent(true);
  }

  return (
    <Card>
      <CardBody>
        <h2 className="mb-4 text-lg font-semibold">Recuperar contraseña</h2>
        {sent ? (
          <Alert tone="info">
            Si el correo está registrado, recibirás un enlace para restablecer tu
            contraseña.
          </Alert>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Correo" error={errors.email?.message}>
              <Input type="email" autoComplete="email" {...register("email")} />
            </FormField>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Enviar enlace
            </Button>
          </form>
        )}
        <Link href="/login" className="mt-4 block text-center text-xs text-gray-500 hover:text-brand">
          Volver a iniciar sesión
        </Link>
      </CardBody>
    </Card>
  );
}
