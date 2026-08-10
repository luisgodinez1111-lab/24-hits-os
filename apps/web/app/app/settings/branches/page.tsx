"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@24hits/ui";
import { MapPin } from "lucide-react";
import type { Branch } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  code: z.string().min(1, "Requerido"),
  phone: z.string().optional(),
  address: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function BranchesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.get<Branch[]>("/branches"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const createBranch = useMutation({
    mutationFn: (values: FormValues) => api.post<Branch>("/branches", values),
    onSuccess: async () => {
      reset({ name: "", code: "", phone: "", address: "" });
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.push("Sucursal creada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Sucursales</h1>
      <p className="mb-6 text-sm text-gray-500">Gestiona las sucursales de tu organización</p>

      <Card className="mb-6">
        <CardHeader title="Nueva sucursal" />
        <CardBody>
          <form
            onSubmit={handleSubmit((v) => createBranch.mutate(v))}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <FormField label="Nombre" error={errors.name?.message}>
              <Input {...register("name")} />
            </FormField>
            <FormField label="Código" error={errors.code?.message}>
              <Input {...register("code")} />
            </FormField>
            <FormField label="Teléfono">
              <Input {...register("phone")} />
            </FormField>
            <FormField label="Dirección">
              <Input {...register("address")} />
            </FormField>
            <Button type="submit" className="sm:col-span-2 lg:col-span-1" loading={createBranch.isPending}>
              Agregar
            </Button>
          </form>
        </CardBody>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !branches || branches.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8 text-gray-400" />}
          title="Sin sucursales"
          description="Crea la primera arriba."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Código</TH>
              <TH>Teléfono</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {branches.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.name}</TD>
                <TD className="font-mono text-xs">{b.code}</TD>
                <TD className="text-gray-500">{b.phone ?? "—"}</TD>
                <TD>
                  <Badge tone={b.status === "ACTIVE" ? "green" : "gray"}>{b.status}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
