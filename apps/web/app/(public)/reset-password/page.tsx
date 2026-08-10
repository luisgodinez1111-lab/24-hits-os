"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Card, CardBody, FormField, Input, Spinner, useToast } from "@24hits/ui";
import { api, ApiError } from "@/lib/api";

const schema = z.object({ password: z.string().min(8, "Mínimo 8 caracteres") });
type FormValues = z.infer<typeof schema>;

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const toast = useToast();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    if (!token) {
      toast.push("Falta el token", "error");
      return;
    }
    try {
      await api.post("/auth/reset-password", { token, password: values.password });
      setDone(true);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Error", "error");
    }
  }

  return (
    <Card>
      <CardBody>
        <h2 className="mb-4 text-lg font-semibold">Nueva contraseña</h2>
        {done ? (
          <Alert tone="success">Contraseña actualizada. Inicia sesión con la nueva.</Alert>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Nueva contraseña" error={errors.password?.message}>
              <Input type="password" autoComplete="new-password" {...register("password")} />
            </FormField>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Cambiar contraseña
            </Button>
          </form>
        )}
        <Link href="/login" className="mt-4 block text-center text-sm text-brand">
          Ir a iniciar sesión
        </Link>
      </CardBody>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
