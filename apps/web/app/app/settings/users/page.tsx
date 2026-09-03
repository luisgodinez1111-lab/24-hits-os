"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Dialog,
  EmptyState,
  Combobox,
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
import type { Member, RoleSummary, Warehouse } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";

const inviteSchema = z.object({
  email: z.string().email("Correo inválido"),
  name: z.string().optional(),
});
type InviteValues = z.infer<typeof inviteSchema>;

const statusTone: Record<Member["status"], "green" | "amber" | "gray"> = {
  ACTIVE: "green",
  INVITED: "amber",
  SUSPENDED: "gray",
};

export default function UsersPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [inviteRoles, setInviteRoles] = useState<string[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<Member[]>("/members"),
  });
  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<RoleSummary[]>("/roles"),
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api.get<Warehouse[]>("/warehouses"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema) });

  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: ["members"] });

  const invite = useMutation({
    mutationFn: (values: InviteValues) =>
      api.post("/members/invite", { ...values, roleIds: inviteRoles }),
    onSuccess: async () => {
      reset({ email: "", name: "" });
      setInviteRoles([]);
      await invalidateMembers();
      toast.push("Invitación enviada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "SUSPENDED" }) =>
      api.patch(`/members/${id}/status`, { status }),
    onSuccess: async () => {
      await invalidateMembers();
      toast.push("Estado actualizado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const setWarehouse = useMutation({
    mutationFn: ({ id, defaultWarehouseId }: { id: string; defaultWarehouseId: string | null }) =>
      api.patch(`/members/${id}/warehouse`, { defaultWarehouseId }),
    onSuccess: async () => {
      await invalidateMembers();
      toast.push("Almacén asignado", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  function toggleInviteRole(id: string) {
    setInviteRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Miembros de la organización y sus roles" />

      <Card className="mb-6">
        <CardHeader title="Invitar usuario" subtitle="Recibirá un correo para establecer su contraseña" />
        <CardBody>
          <form
            onSubmit={handleSubmit((v) => {
              if (inviteRoles.length === 0) {
                toast.push("Selecciona al menos un rol", "error");
                return;
              }
              invite.mutate(v);
            })}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Correo" error={errors.email?.message}>
                <Input type="email" {...register("email")} />
              </FormField>
              <FormField label="Nombre (opcional)">
                <Input {...register("name")} />
              </FormField>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-gray-600">Roles</p>
              <div className="flex flex-wrap gap-3">
                {roles?.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={inviteRoles.includes(r.id)}
                      onChange={() => toggleInviteRole(r.id)}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>
            <Button type="submit" loading={invite.isPending}>
              Enviar invitación
            </Button>
          </form>
        </CardBody>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !members || members.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8 text-gray-400" />}
          title="Sin miembros"
        />
      ) : (
        <Table stickyHeader>
          <THead>
            <TR>
              <TH>Usuario</TH>
              <TH>Roles</TH>
              <TH>Almacén de entrega</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {members.map((m) => (
              <TR key={m.id}>
                <TD>
                  <div className="font-medium">{m.user.name ?? m.user.email}</div>
                  <div className="text-xs text-gray-500">{m.user.email}</div>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r.role.id} tone="brand">
                        {r.role.name}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD>
                  <Combobox
                    className="min-w-[11rem]"
                    value={m.defaultWarehouse?.id ?? ""}
                    disabled={setWarehouse.isPending}
                    placeholder="Sin asignar"
                    options={[{ value: "", label: "Sin asignar" }, ...(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))]}
                    onChange={(v) => setWarehouse.mutate({ id: m.id, defaultWarehouseId: v || null })}
                  />
                </TD>
                <TD>
                  <Badge tone={statusTone[m.status]}>{m.status}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                      Roles
                    </Button>
                    {m.status === "SUSPENDED" ? (
                      <Button
                        size="sm"
                        onClick={() => setStatus.mutate({ id: m.id, status: "ACTIVE" })}
                      >
                        Activar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setStatus.mutate({ id: m.id, status: "SUSPENDED" })}
                      >
                        Suspender
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <EditRolesDialog
        member={editing}
        roles={roles ?? []}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await invalidateMembers();
        }}
      />
    </div>
  );
}

function EditRolesDialog({
  member,
  roles,
  onClose,
  onSaved,
}: {
  member: Member | null;
  roles: RoleSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);

  // Sincroniza la selección al abrir con los roles actuales del miembro.
  const currentIds = member?.roles.map((r) => r.role.id) ?? [];
  const initial = member ? currentIds.join(",") : "";
  const [lastInitial, setLastInitial] = useState<string>("");
  if (member && initial !== lastInitial) {
    setLastInitial(initial);
    setSelected(currentIds);
  }

  const save = useMutation({
    mutationFn: () => api.patch(`/members/${member!.id}/roles`, { roleIds: selected }),
    onSuccess: onSaved,
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  return (
    <Dialog
      open={Boolean(member)}
      onClose={onClose}
      title={`Roles de ${member?.user.name ?? member?.user.email ?? ""}`}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() => {
              if (selected.length === 0) {
                toast.push("Selecciona al menos un rol", "error");
                return;
              }
              save.mutate();
            }}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {roles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <Checkbox checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
            {r.name}
          </label>
        ))}
      </div>
    </Dialog>
  );
}
