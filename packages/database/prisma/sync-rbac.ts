import { PERMISSIONS, SYSTEM_ROLES, resolveRolePermissions } from "@24hits/auth";
import { createPrismaClient } from "../src/client.js";

// Sincroniza SOLO el catálogo RBAC (permisos + roles del sistema) contra la BD.
// A diferencia de seed.ts, NO crea organización ni catálogo de desarrollo, por lo
// que es SEGURO ejecutarlo en producción. Es idempotente: se puede correr cada vez
// que se agregan/cambian permisos o permisos de roles del sistema.
//
//   pnpm --filter @24hits/database db:sync-rbac
//
// Nota: los roles PROPIOS de cada organización (no del sistema) no se tocan; si un
// admin quiere el permiso nuevo en un rol personalizado, lo asigna desde la UI de
// roles (el permiso ya aparece en el catálogo).

const prisma = createPrismaClient();

async function main(): Promise<void> {
  // 1) Upsert del catálogo global de permisos.
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { category: p.category, description: p.description },
      create: { key: p.key, category: p.category, description: p.description },
    });
  }
  const all = await prisma.permission.findMany({ select: { id: true, key: true } });
  const permByKey = new Map(all.map((p) => [p.key, p.id]));

  // 2) Re-sincroniza permisos de cada rol del sistema (plantilla global).
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { key: role.key, isSystem: true, organizationId: null },
      select: { id: true },
    });
    const roleId =
      existing?.id ??
      (
        await prisma.role.create({
          data: { key: role.key, name: role.name, description: role.description, isSystem: true },
          select: { id: true },
        })
      ).id;

    // Mantén nombre/descripción al día por si cambiaron en código.
    if (existing) {
      await prisma.role.update({
        where: { id: roleId },
        data: { name: role.name, description: role.description },
      });
    }

    await prisma.rolePermission.deleteMany({ where: { roleId } });
    const permissionIds = resolveRolePermissions(role)
      .map((key) => permByKey.get(key))
      .filter((id): id is string => Boolean(id));
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
  }

  console.log(
    `[sync-rbac] OK - ${PERMISSIONS.length} permisos, ${SYSTEM_ROLES.length} roles del sistema sincronizados.`
  );
}

main()
  .catch((e) => {
    console.error("[sync-rbac] Error:", e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
