"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, Card, CardBody, FormField, Input, useToast } from "@24hits/ui";
import { api, ApiError } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});
type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const toast = useToast();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      await api.post("/auth/register", values);
      setDone(true);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Error al registrar", "error");
    }
  }

  if (done) {
    return (
      <Card>
        <CardBody>
          <Alert tone="success" title="Revisa tu correo">
            Te enviamos un enlace de verificación. (En desarrollo aparece en los logs del
            worker.)
          </Alert>
          <Link href="/login" className="mt-4 block text-center text-sm text-brand">
            Ir a iniciar sesión
          </Link>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <h2 className="mb-4 text-lg font-semibold">Crear cuenta</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Nombre" error={errors.name?.message}>
            <Input autoComplete="name" {...register("name")} />
          </FormField>
          <FormField label="Correo" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <FormField label="Contraseña" error={errors.password?.message} hint="Mínimo 8 caracteres">
            <Input type="password" autoComplete="new-password" {...register("password")} />
          </FormField>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Registrarme
          </Button>
        </form>
        <Link href="/login" className="mt-4 block text-center text-xs text-gray-500 hover:text-brand">
          Ya tengo cuenta
        </Link>
      </CardBody>
    </Card>
  );
}
