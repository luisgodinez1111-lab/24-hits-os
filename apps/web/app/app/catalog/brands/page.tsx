"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Brand } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

export default function BrandsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["brands"], queryFn: () => api.get<Brand[]>("/brands") });

  const create = useMutation({
    mutationFn: () => api.post("/brands", { name }),
    onSuccess: async () => { setName(""); await qc.invalidateQueries({ queryKey: ["brands"] }); toast.push("Marca creada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Marcas</h1>
      <p className="mb-6 text-sm text-gray-500">Marcas del catálogo</p>
      <Card className="mb-6">
        <CardHeader title="Nueva marca" />
        <CardBody>
          <div className="flex items-end gap-3">
            <FormField label="Nombre" className="flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <Button loading={create.isPending} onClick={() => name.trim() && create.mutate()}>Agregar</Button>
          </div>
        </CardBody>
      </Card>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={<Tag className="h-8 w-8 text-gray-400" />} title="Sin marcas" />
      ) : (
        <Table>
          <THead><TR><TH>Nombre</TH><TH>Slug</TH><TH>Estado</TH></TR></THead>
          <TBody>
            {data.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.name}</TD>
                <TD className="font-mono text-xs text-gray-500">{b.slug}</TD>
                <TD><Badge tone={b.status === "ACTIVE" ? "green" : "gray"}>{b.status}</Badge></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
