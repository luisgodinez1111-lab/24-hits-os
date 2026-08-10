"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Button, Card, CardBody, EmptyState } from "@24hits/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";

export default function SelectOrganizationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  async function select(organizationId: string) {
    await api.post("/auth/select-organization", { organizationId });
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    router.replace("/app");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-bold">Selecciona una organización</h1>
      <p className="mb-6 text-sm text-gray-500">Elige con cuál quieres trabajar</p>

      {me && me.memberships.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8 text-gray-400" />}
          title="No perteneces a ninguna organización"
          description="Crea una para empezar."
          action={<Button onClick={() => router.push("/app/settings/organization")}>Crear organización</Button>}
        />
      ) : (
        <div className="space-y-3">
          {me?.memberships.map((m) => (
            <Card key={m.id}>
              <CardBody className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{m.organization.name}</p>
                  <p className="text-xs text-gray-500">{m.organization.slug}</p>
                </div>
                <Button size="sm" onClick={() => select(m.organization.id)}>
                  Entrar
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
