"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
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
  PageHeader,
} from "@24hits/ui";
import type { PermissionCatalogGroup, RoleSummary } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

export default function RolesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ key: "", name: "", description: "" });
  const [perms, setPerms] = useState<string[]>([]);

  const { data: roles, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<RoleSummary[]>("/roles"),
  });
  const { data: catalog } = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: () => api.get<PermissionCatalogGroup[]>("/roles/permissions"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/roles", {
        key: form.key,
        name: form.name,
        description: form.description || undefined,
        permissionKeys: perms,
      }),
    onSuccess: async () => {
      setForm({ key: "", name: "", description: "" });
      setPerms([]);
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      toast.push("Rol creado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const togglePerm = (key: string) =>
    setPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  return (
    <div>
      <PageHeader title="Roles" subtitle="Roles del sistema y roles propios de la organización" />

      {isLoading ? (
        <Skeleton className="mb-6 h-40 w-full" />
      ) : (
        <Table stickyHeader>
          <THead>
            <TR>
              <TH>Rol</TH>
              <TH>Clave</TH>
              <TH>Tipo</TH>
              <TH className="text-right">Permisos</TH>
              <TH className="text-right">Miembros</TH>
            </TR>
          </THead>
          <TBody>
            {roles?.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.name}</TD>
                <TD className="font-mono text-xs">{r.key}</TD>
                <TD>
                  <Badge tone={r.isSystem ? "blue" : "brand"}>
                    {r.isSystem ? "Sistema" : "Organización"}
                  </Badge>
                </TD>
                <TD className="text-right">{r.permissions.length}</TD>
                <TD className="text-right">{r._count.membershipRoles}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Card className="mt-6">
        <CardHeader title="Nuevo rol de organización" />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField label="Clave" hint="minúsculas y guion bajo">
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="supervisor_turno"
              />
            </FormField>
            <FormField label="Nombre">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Descripción">
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FormField>
          </div>

          <div className="mt-4 space-y-4">
            {catalog?.map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {group.category}
                </p>
                <div className="flex flex-wrap gap-3">
                  {group.permissions.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={perms.includes(p.key)}
                        onChange={() => togglePerm(p.key)}
                      />
                      <span className="font-mono text-xs">{p.key}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button
            className="mt-6"
            loading={create.isPending}
            onClick={() => {
              if (!form.key || !form.name || perms.length === 0) {
                toast.push("Completa clave, nombre y al menos un permiso", "error");
                return;
              }
              create.mutate();
            }}
          >
            Crear rol
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
