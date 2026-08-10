import argon2 from "argon2";
import { PERMISSIONS, SYSTEM_ROLES, resolveRolePermissions } from "@24hits/auth";
import { createPrismaClient, withSystem, type TenantTx } from "../src/client.js";

// Seed de desarrollo idempotente. Siembra:
//  - Catálogo global de permisos.
//  - Roles del sistema (plantillas globales) + sus permisos.
//  - Organización "24 HITS", sucursal Chihuahua, almacén principal.
//  - Usuario owner@example.local (Organization Owner).
// Credenciales SOLO desarrollo (ver README / .env.example).

const prisma = createPrismaClient();

const DEV_OWNER_EMAIL = "owner@example.local";
const DEV_OWNER_PASSWORD = "Owner123!Dev";

async function seedPermissions(): Promise<Map<string, string>> {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { category: p.category, description: p.description },
      create: { key: p.key, category: p.category, description: p.description },
    });
  }
  const all = await prisma.permission.findMany({ select: { id: true, key: true } });
  return new Map(all.map((p) => [p.key, p.id]));
}

async function seedSystemRoles(permByKey: Map<string, string>): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { key: role.key, isSystem: true, organizationId: null },
      select: { id: true },
    });
    const roleId =
      existing?.id ??
      (
        await prisma.role.create({
          data: {
            key: role.key,
            name: role.name,
            description: role.description,
            isSystem: true,
          },
          select: { id: true },
        })
      ).id;

    // Resincroniza permisos del rol (idempotente).
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    const permissionIds = resolveRolePermissions(role)
      .map((key) => permByKey.get(key))
      .filter((id): id is string => Boolean(id));
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }
}

async function seedDevOrganization(): Promise<string> {
  const passwordHash = await argon2.hash(DEV_OWNER_PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.upsert({
    where: { email: DEV_OWNER_EMAIL },
    update: {},
    create: {
      email: DEV_OWNER_EMAIL,
      name: "Owner Dev",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });

  let org = await prisma.organization.findUnique({
    where: { slug: "24-hits" },
    select: { id: true },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "24 HITS", slug: "24-hits", status: "ACTIVE" },
      select: { id: true },
    });
  }
  const organizationId = org.id;

  // Settings/Branch/Warehouse tienen RLS → requieren bypass (withSystem).
  await withSystem(prisma, async (tx) => {
    const settings = await tx.organizationSettings.findUnique({
      where: { organizationId },
      select: { id: true },
    });
    if (!settings) {
      await tx.organizationSettings.create({ data: { organizationId } });
    }

    let branch = await tx.branch.findFirst({
      where: { organizationId, code: "MAIN" },
      select: { id: true },
    });
    if (!branch) {
      branch = await tx.branch.create({
        data: { organizationId, name: "Chihuahua", code: "MAIN" },
        select: { id: true },
      });
    }

    const warehouse = await tx.warehouse.findFirst({
      where: { branchId: branch.id, code: "MAIN" },
      select: { id: true },
    });
    if (!warehouse) {
      await tx.warehouse.create({
        data: {
          organizationId,
          branchId: branch.id,
          name: "Almacén Principal",
          code: "MAIN",
          type: "MAIN",
        },
      });
    }
  });

  const ownerRole = await prisma.role.findFirst({
    where: { key: "organization_owner", isSystem: true, organizationId: null },
    select: { id: true },
  });

  let membership = await prisma.organizationMembership.findFirst({
    where: { userId: user.id, organizationId },
    select: { id: true },
  });
  if (!membership) {
    membership = await prisma.organizationMembership.create({
      data: { userId: user.id, organizationId, status: "ACTIVE" },
      select: { id: true },
    });
  }

  if (ownerRole) {
    const link = await prisma.membershipRole.findFirst({
      where: { membershipId: membership.id, roleId: ownerRole.id },
      select: { membershipId: true },
    });
    if (!link) {
      await prisma.membershipRole.create({
        data: { membershipId: membership.id, roleId: ownerRole.id },
      });
    }
  }
  return organizationId;
}

// Catálogo de DESARROLLO (idempotente). Datos ficticios claramente marcados; los
// tests NO dependen de esto (crean sus propios fixtures). No debe llegar a producción.
// Usa `tx` con bypass de RLS (tablas de catálogo protegidas por RLS).
async function seedDevCatalog(tx: TenantTx, organizationId: string): Promise<void> {
  const units = [
    { code: "PIECE", name: "Pieza" },
    { code: "PACK", name: "Paquete" },
    { code: "BOX", name: "Caja" },
  ];
  for (const u of units) {
    await tx.unitOfMeasure.upsert({
      where: { organizationId_code: { organizationId, code: u.code } },
      update: {},
      create: { organizationId, code: u.code, name: u.name },
    });
  }
  const piece = await tx.unitOfMeasure.findUnique({
    where: { organizationId_code: { organizationId, code: "PIECE" } },
  });

  const brands = ["Hyper Bar", "Elfworld", "Waka", "BOOD", "IJOY", "LIO", "FASTA"];
  for (const name of brands) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await tx.brand.upsert({
      where: { organizationId_slug: { organizationId, slug } },
      update: {},
      create: { organizationId, name, slug },
    });
  }

  const flavors = ["Blue Razz", "Watermelon Ice", "Grape Ice", "Strawberry Kiwi"];
  for (const name of flavors) {
    const normalizedName = name.toLowerCase();
    await tx.flavor.upsert({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
      update: {},
      create: { organizationId, name, normalizedName },
    });
  }

  const hyper = await tx.brand.findUnique({
    where: { organizationId_slug: { organizationId, slug: "hyper-bar" } },
  });
  if (piece && hyper) {
    const product = await tx.product.upsert({
      where: { organizationId_slug: { organizationId, slug: "hyper-bar-120k" } },
      update: {},
      create: {
        organizationId,
        brandId: hyper.id,
        name: "Hyper Bar 120K",
        slug: "hyper-bar-120k",
        status: "ACTIVE",
      },
    });
    const variantSkus = [
      { sku: "HB120-BR", flavor: "blue razz", name: "Hyper Bar 120K / Blue Razz" },
      { sku: "HB120-WI", flavor: "watermelon ice", name: "Hyper Bar 120K / Watermelon Ice" },
    ];
    for (const vs of variantSkus) {
      const existing = await tx.productVariant.findFirst({
        where: { organizationId, sku: vs.sku },
        select: { id: true },
      });
      if (existing) continue;
      const flavor = await tx.flavor.findFirst({
        where: { organizationId, normalizedName: vs.flavor },
        select: { id: true },
      });
      await tx.productVariant.create({
        data: {
          organizationId,
          productId: product.id,
          flavorId: flavor?.id ?? null,
          sku: vs.sku,
          name: vs.name,
          purchaseUnitId: piece.id,
          salesUnitId: piece.id,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  const permByKey = await seedPermissions();
  await seedSystemRoles(permByKey);
  const organizationId = await seedDevOrganization();

  // El catálogo dev usa tablas con RLS → bypass de sistema.
  await withSystem(prisma, (tx) => seedDevCatalog(tx, organizationId));

  console.log(
    `[seed] OK - ${PERMISSIONS.length} permisos, ${SYSTEM_ROLES.length} roles, org "24 HITS", ` +
      `catálogo dev (marcas/sabores/producto), owner ${DEV_OWNER_EMAIL}`
  );
}

main()
  .catch((e) => {
    console.error("[seed] Error:", e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
