"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormField,
  Input,
  Switch,
  useToast,
} from "@24hits/ui";
import type { FeatureFlag, OrganizationSettings } from "@24hits/contracts";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/me";

const createSchema = z.object({
  organizationName: z.string().min(2, "Mínimo 2 caracteres"),
  branchName: z.string().min(2).default("Chihuahua"),
});
type CreateValues = z.infer<typeof createSchema>;

interface SettingsResponse {
  settings: OrganizationSettings;
  featureFlags: FeatureFlag[];
}

const KNOWN_FLAGS = [
  "wholesale.enabled",
  "crm.enabled",
  "advancedAnalytics.enabled",
  "routeOptimization.enabled",
];

// Nombre legible por flag (la clave técnica se muestra debajo como referencia).
const FLAG_LABELS: Record<string, string> = {
  "wholesale.enabled": "Mayoreo",
  "crm.enabled": "CRM / WhatsApp",
  "advancedAnalytics.enabled": "Analítica avanzada",
  "routeOptimization.enabled": "Optimización de ruta",
};

export default function OrganizationSettingsPage() {
  const { data: me } = useMe();

  if (me && !me.activeOrganization) return <CreateOrganization />;
  if (!me?.activeOrganization) return null;
  return <ManageOrganization />;
}

function CreateOrganization() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema) });

  async function createOrg(values: CreateValues) {
    try {
      await api.post("/organizations", values);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.push("Organización creada", "success");
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : "Error", "error");
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-title text-gray-900">Crear organización</h1>
      <p className="mb-6 text-sm text-gray-500">Serás el Organization Owner</p>
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit(createOrg)} className="space-y-4">
            <FormField label="Nombre de la organización" error={errors.organizationName?.message}>
              <Input {...register("organizationName")} />
            </FormField>
            <FormField label="Primera sucursal" error={errors.branchName?.message}>
              <Input defaultValue="Chihuahua" {...register("branchName")} />
            </FormField>
            <Button type="submit" loading={isSubmitting}>
              Crear organización
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

function ManageOrganization() {
  const { data: me } = useMe();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/settings"),
    retry: false,
  });

  const save = useMutation({
    mutationFn: (values: Partial<OrganizationSettings>) => api.patch("/settings", values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.push("Configuración guardada", "success");
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const setFlag = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.post("/settings/feature-flags", { key, enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Error", "error"),
  });

  const { register, handleSubmit } = useForm<{
    timezone: string;
    defaultCurrency: string;
    orderNumberPrefix: string;
    deliveryCutoffTime: string;
  }>({ values: data ? {
    timezone: data.settings.timezone,
    defaultCurrency: data.settings.defaultCurrency,
    orderNumberPrefix: data.settings.orderNumberPrefix,
    deliveryCutoffTime: data.settings.deliveryCutoffTime ?? "",
  } : undefined });

  const flagEnabled = (key: string) =>
    Boolean(data?.featureFlags.find((f) => f.key === key)?.enabled);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="mb-1 text-title text-gray-900">Organización</h1>
        <p className="text-sm text-gray-500">Datos y configuración de negocio</p>
      </div>

      <Card>
        <CardHeader title={me!.activeOrganization!.name} subtitle={me!.activeOrganization!.slug} />
        <CardBody>
          <Badge tone="brand">{me!.activeOrganization!.status}</Badge>
        </CardBody>
      </Card>

      {isError ? (
        <Alert tone="warning">No tienes permiso para ver la configuración (organization.manage).</Alert>
      ) : isLoading || !data ? (
        <Card>
          <CardBody>Cargando configuración…</CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Configuración de negocio" />
            <CardBody>
              <form
                onSubmit={handleSubmit((v) =>
                  save.mutate({
                    timezone: v.timezone,
                    defaultCurrency: v.defaultCurrency,
                    orderNumberPrefix: v.orderNumberPrefix,
                    deliveryCutoffTime: v.deliveryCutoffTime || null,
                  })
                )}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <FormField label="Zona horaria">
                  <Input {...register("timezone")} />
                </FormField>
                <FormField label="Moneda">
                  <Input maxLength={3} {...register("defaultCurrency")} />
                </FormField>
                <FormField label="Prefijo de pedidos">
                  <Input {...register("orderNumberPrefix")} />
                </FormField>
                <FormField label="Corte de reparto (HH:mm)">
                  <Input placeholder="18:00" {...register("deliveryCutoffTime")} />
                </FormField>
                <div className="sm:col-span-2">
                  <Button type="submit" loading={save.isPending}>
                    Guardar
                  </Button>
                </div>
              </form>

              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <span className="font-medium">Inventario negativo: </span>
                <Badge tone={data.settings.negativeInventoryAllowed ? "amber" : "gray"}>
                  {data.settings.negativeInventoryAllowed ? "Permitido" : "Bloqueado"}
                </Badge>
                <p className="mt-1 text-xs text-gray-500">
                  Bloqueado por defecto. Activarlo requiere una decisión de producto explícita
                  (no configurable desde aquí).
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Feature flags" />
            <CardBody className="divide-y divide-gray-100">
              {KNOWN_FLAGS.map((key) => (
                <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{FLAG_LABELS[key] ?? key}</p>
                    <p className="truncate font-mono text-[11px] text-gray-400">{key}</p>
                  </div>
                  <Switch
                    label={FLAG_LABELS[key] ?? key}
                    checked={flagEnabled(key)}
                    disabled={setFlag.isPending}
                    onChange={(enabled) => setFlag.mutate({ key, enabled })}
                  />
                </div>
              ))}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
