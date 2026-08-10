import { describe, expect, it } from "vitest";
import { ALL_PERMISSION_KEYS } from "./permissions.js";
import { SYSTEM_ROLES, resolveRolePermissions } from "./roles.js";

function role(key: string) {
  const found = SYSTEM_ROLES.find((r) => r.key === key);
  if (!found) throw new Error(`Rol no encontrado: ${key}`);
  return found;
}

describe("RBAC — roles del sistema", () => {
  it("Organization Owner tiene TODOS los permisos", () => {
    const perms = resolveRolePermissions(role("organization_owner"));
    expect(perms.sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it("Warehouse Operator NO tiene users.manage (requisito crítico)", () => {
    const perms = resolveRolePermissions(role("warehouse_operator"));
    expect(perms).not.toContain("users.manage");
    // Sí puede leer inventario/almacenes.
    expect(perms).toContain("inventory.read");
    expect(perms).toContain("warehouses.read");
  });

  it("Organization Admin tiene todo salvo organization.manage", () => {
    const perms = resolveRolePermissions(role("organization_admin"));
    expect(perms).not.toContain("organization.manage");
    expect(perms).toContain("users.manage");
  });

  it("Read Only y Auditor solo tienen permisos de lectura", () => {
    for (const key of ["read_only", "auditor"]) {
      const perms = resolveRolePermissions(role(key));
      const nonRead = perms.filter((p) => !p.endsWith(".read"));
      // Auditor añade audit.read (que ya es .read); read_only solo .read.
      expect(nonRead).toEqual([]);
    }
  });

  it("todo permiso de un rol existe en el catálogo", () => {
    for (const r of SYSTEM_ROLES) {
      for (const p of resolveRolePermissions(r)) {
        expect(ALL_PERMISSION_KEYS).toContain(p);
      }
    }
  });
});
