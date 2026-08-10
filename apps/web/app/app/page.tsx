"use client";

import { Card, CardBody } from "@24hits/ui";
import { useMe } from "@/lib/me";

export default function AppHomePage() {
  const { data: me } = useMe();

  const rows: Array<{ label: string; value: string }> = [
    { label: "Usuario", value: me?.user?.name ?? me?.user?.email ?? "—" },
    { label: "Correo", value: me?.user?.email ?? "—" },
    { label: "Organización", value: me?.activeOrganization?.name ?? "—" },
    { label: "Estado", value: me?.activeOrganization?.status ?? "—" },
    { label: "Permisos", value: me ? `${me.permissions.length} asignados` : "—" },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Bienvenido a 24 HITS OS</h1>
      <p className="mb-8 text-sm text-gray-500">Estado base de tu cuenta y organización</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.label}>
            <CardBody>
              <p className="text-xs uppercase tracking-wide text-gray-400">{r.label}</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{r.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
