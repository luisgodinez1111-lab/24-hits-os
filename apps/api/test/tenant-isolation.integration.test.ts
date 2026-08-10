import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, withSystem, withTenant } from "@24hits/database";

// PRUEBA CRÍTICA (ADR-004): con Row Level Security activo, la Organización A no
// puede leer datos operativos de la Organización B aunque conozca su UUID.
// Requiere una BD PostgreSQL migrada (incluida la migración de RLS) en DATABASE_URL.

const prisma = createPrismaClient();

let orgAId: string;
let orgBId: string;
let branchBId: string;
const suffix = Date.now().toString(36);

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const orgA = await tx.organization.create({
      data: { name: "Org A", slug: `iso-a-${suffix}` },
    });
    const orgB = await tx.organization.create({
      data: { name: "Org B", slug: `iso-b-${suffix}` },
    });
    const branchB = await tx.branch.create({
      data: { organizationId: orgB.id, name: "Sucursal B", code: `B-${suffix}` },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
    branchBId = branchB.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.branch.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await tx.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  });
  await prisma.$disconnect();
});

describe("Aislamiento de tenants (RLS)", () => {
  it("Org A NO puede leer un Branch de Org B por su UUID", async () => {
    const found = await withTenant(prisma, orgAId, (tx) =>
      tx.branch.findFirst({ where: { id: branchBId } })
    );
    expect(found).toBeNull();
  });

  it("Org A no ve el Branch de B ni al listar", async () => {
    const list = await withTenant(prisma, orgAId, (tx) => tx.branch.findMany());
    expect(list.some((b) => b.id === branchBId)).toBe(false);
  });

  it("Org B SÍ ve su propio Branch", async () => {
    const found = await withTenant(prisma, orgBId, (tx) =>
      tx.branch.findFirst({ where: { id: branchBId } })
    );
    expect(found?.id).toBe(branchBId);
  });

  it("Org A no puede actualizar el Branch de B (RLS bloquea el UPDATE)", async () => {
    const affected = await withTenant(prisma, orgAId, (tx) =>
      tx.branch.updateMany({ where: { id: branchBId }, data: { name: "hackeado" } })
    );
    expect(affected.count).toBe(0);
  });
});
