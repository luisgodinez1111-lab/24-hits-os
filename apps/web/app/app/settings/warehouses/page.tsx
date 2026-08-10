"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  FormField,
  Input,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@24hits/ui";
import type { Branch, Warehouse } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

const schema = z.object({
  branchId: z.string().uuid("Selecciona una sucursal"),
  name: z.string().min(2, "Mínimo 2 caracteres"),
  code: z.string().min(1, "Requerido"),
  type: z.enum(["MAIN", "COUNTER", "DELIVERY"]),
});
type FormValues = z.infer<typeof schema>;

const typeLabels: Record<FormValues["type"], string> = {
  MAIN: "Principal",
  COUNTER: "Mostrador",
  DELIVERY: "Reparto",
};

export default function WarehousesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.get<Branch[]>("/branches"),
  });
  const { data: warehouses, isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api.get<Warehouse[]>("/warehouses"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: "MAIN" } });

  const create = useMutation({
    mutationFn: (values: FormValues) => api.post<Warehouse>("/warehouses", values),
    onSuccess: async () => {
      reset({ branchId: "", name: "", code: "", type: "MAIN" });
      await queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      toast.push("Almacén creado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const branchName = (id: string) => branches?.find((b) => b.id === id)?.name ?? id;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Almacenes</h1>
      <p className="mb-6 text-sm text-gray-500">
        Una sucursal puede tener varios almacenes (principal, mostrador, reparto)
      </p>

      <Card className="mb-6">
        <CardHeader title="Nuevo almacén" />
        <CardBody>
          <form
            onSubmit={handleSubmit((v) => create.mutate(v))}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <FormField label="Sucursal" error={errors.branchId?.message}>
              <Select {...register("branchId")}>
                <option value="">Selecciona…</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Nombre" error={errors.name?.message}>
              <Input {...register("name")} />
            </FormField>
            <FormField label="Código" error={errors.code?.message}>
              <Input {...register("code")} />
            </FormField>
            <FormField label="Tipo">
              <Select {...register("type")}>
                <option value="MAIN">Principal</option>
                <option value="COUNTER">Mostrador</option>
                <option value="DELIVERY">Reparto</option>
              </Select>
            </FormField>
            <Button type="submit" loading={create.isPending}>
              Agregar
            </Button>
          </form>
        </CardBody>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !warehouses || warehouses.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8 text-gray-400" />}
          title="Sin almacenes"
          description="Crea el primero arriba."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Código</TH>
              <TH>Sucursal</TH>
              <TH>Tipo</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {warehouses.map((w) => (
              <TR key={w.id}>
                <TD className="font-medium">{w.name}</TD>
                <TD className="font-mono text-xs">{w.code}</TD>
                <TD className="text-gray-500">{branchName(w.branchId)}</TD>
                <TD>
                  <Badge tone="blue">{typeLabels[w.type]}</Badge>
                </TD>
                <TD>
                  <Badge tone={w.status === "ACTIVE" ? "green" : "gray"}>{w.status}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
