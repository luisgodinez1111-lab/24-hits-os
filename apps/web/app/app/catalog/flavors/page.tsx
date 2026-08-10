"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Droplet } from "lucide-react";
import {
  Button, Card, CardBody, CardHeader, EmptyState, FormField, Input, Skeleton, useToast,
} from "@24hits/ui";
import type { Flavor } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";

export default function FlavorsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["flavors"], queryFn: () => api.get<Flavor[]>("/flavors") });

  const create = useMutation({
    mutationFn: () => api.post("/flavors", { name }),
    onSuccess: async () => { setName(""); await qc.invalidateQueries({ queryKey: ["flavors"] }); toast.push("Sabor creado", "success"); },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Sabores</h1>
      <p className="mb-6 text-sm text-gray-500">Sabores reutilizables (no texto libre)</p>
      <Card className="mb-6">
        <CardHeader title="Nuevo sabor" />
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
        <EmptyState icon={<Droplet className="h-8 w-8 text-gray-400" />} title="Sin sabores" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {data.map((f) => (
            <span key={f.id} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm">{f.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}
