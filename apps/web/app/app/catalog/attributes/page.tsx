"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Droplet, FolderTree, Tag } from "lucide-react";
import { Badge, Button, Card, CardBody, Input, Skeleton, useToast } from "@24hits/ui";
import type { Brand, Category, Flavor } from "@/lib/catalog-types";
import { api, ApiError } from "@/lib/api";
import { hasPermission, useMe } from "@/lib/me";

// Atributos del catálogo: marcas, categorías y sabores son listas simples (un
// nombre) que no ameritan una página completa cada una. Se agrupan en tres
// paneles compactos, cada uno visible según el permiso del usuario.
export default function AttributesPage() {
  const { data: me, isLoading } = useMe();
  const can = (p: Parameters<typeof hasPermission>[1]) => isLoading || hasPermission(me, p);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {can("brands.read") && (
        <AttrPanel<Brand>
          title="Marcas"
          icon={<Tag className="h-4 w-4 text-gray-500" />}
          endpoint="/brands"
          queryKey="brands"
          placeholder="Nueva marca"
          meta={(b) => <Badge tone={b.status === "ACTIVE" ? "green" : "gray"}>{b.status === "ACTIVE" ? "Activa" : "Inactiva"}</Badge>}
        />
      )}
      {can("categories.read") && (
        <AttrPanel<Category>
          title="Categorías"
          icon={<FolderTree className="h-4 w-4 text-gray-500" />}
          endpoint="/categories"
          queryKey="categories"
          placeholder="Nueva categoría"
          meta={(c) => <span className="font-mono text-[10px] text-gray-400">{c.slug}</span>}
        />
      )}
      {can("flavors.read") && (
        <AttrPanel<Flavor>
          title="Sabores"
          icon={<Droplet className="h-4 w-4 text-gray-500" />}
          endpoint="/flavors"
          queryKey="flavors"
          placeholder="Nuevo sabor"
        />
      )}
    </div>
  );
}

// Panel genérico para una lista simple (nombre + creación en línea).
function AttrPanel<T extends { id: string; name: string }>({
  title,
  icon,
  endpoint,
  queryKey,
  placeholder,
  meta,
}: {
  title: string;
  icon: ReactNode;
  endpoint: string;
  queryKey: string;
  placeholder: string;
  meta?: (item: T) => ReactNode;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: () => api.get<T[]>(endpoint) });

  const create = useMutation({
    mutationFn: () => api.post(endpoint, { name: name.trim() }),
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: [queryKey] });
      toast.push("Agregado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-xs text-gray-400 tabular-nums">{data?.length ?? 0}</span>
      </div>
      <CardBody className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" loading={create.isPending}>Agregar</Button>
        </form>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Sin {title.toLowerCase()}.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
            {data.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="truncate font-medium">{item.name}</span>
                {meta && <span className="shrink-0">{meta(item)}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
