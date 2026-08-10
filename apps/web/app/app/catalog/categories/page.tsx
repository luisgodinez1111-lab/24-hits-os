"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderTree } from "lucide-react";
import {
  Button, Card, CardBody, CardHeader, EmptyState, FormField, Input, Skeleton,
  Table, TBody, TD, TH, THead, TR, useToast,
} from "@24hits/ui";
import type { Category } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

export default function CategoriesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });

  const create = useMutation({
    mutationFn: () => api.post("/categories", { name }),
    onSuccess: async () => { setName(""); await qc.invalidateQueries({ queryKey: ["categories"] }); toast.push("Categoría creada", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Categorías</h1>
      <p className="mb-6 text-sm text-gray-500">Categorías del catálogo (jerárquicas)</p>
      <Card className="mb-6">
        <CardHeader title="Nueva categoría" />
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
        <EmptyState icon={<FolderTree className="h-8 w-8 text-gray-400" />} title="Sin categorías" />
      ) : (
        <Table>
          <THead><TR><TH>Nombre</TH><TH>Slug</TH></TR></THead>
          <TBody>
            {data.map((c) => (
              <TR key={c.id}><TD className="font-medium">{c.name}</TD><TD className="font-mono text-xs text-gray-500">{c.slug}</TD></TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
