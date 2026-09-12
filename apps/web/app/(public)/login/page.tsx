"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card, CardBody, FormField, Input, useToast } from "@24hits/ui";
import { api, ApiError } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(1, "Requerido"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [showPw, setShowPw] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      const res = await api.post<{ needsOrgSelection: boolean }>("/auth/login", values);
      // Vuelve a donde el middleware te interceptó (solo rutas internas /app).
      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && next.startsWith("/app") ? next : "/app";
      router.push(res.needsOrgSelection ? "/app/select-organization" : safeNext);
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Error al iniciar sesión", "error");
    }
  }

  return (
    <Card>
      <CardBody>
        <h2 className="mb-4 text-lg font-semibold">Iniciar sesión</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField label="Correo" error={errors.email?.message}>
            <Input type="email" autoComplete="email" {...register("email")} />
          </FormField>
          <FormField label="Contraseña" error={errors.password?.message}>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} autoComplete="current-password" className="pr-10" {...register("password")} />
              <button type="button" onClick={() => setShowPw((v) => !v)} tabIndex={-1}
                aria-label={showPw ? "Ocultar contraseña" : "Ver contraseña"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Entrar
          </Button>
        </form>
        <div className="mt-4 flex justify-between text-xs text-gray-500">
          <Link href="/forgot-password" className="hover:text-brand">
            ¿Olvidaste tu contraseña?
          </Link>
          <Link href="/register" className="hover:text-brand">
            Crear cuenta
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
