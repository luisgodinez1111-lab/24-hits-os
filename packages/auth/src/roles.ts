import {
  ALL_PERMISSION_KEYS,
  READ_PERMISSION_KEYS,
  type PermissionKey,
} from "./permissions.js";

export interface SystemRoleDefinition {
  key: string;
  name: string;
  description: string;
  // "ALL" = todos los permisos (owner). Si no, lista explícita.
  permissions: PermissionKey[] | "ALL";
}

// Permisos de lectura SENSIBLES (financieros): no se otorgan a un rol de solo lectura
// genérico. Costos y utilidades exigen asignación explícita.
const SENSITIVE_READ: PermissionKey[] = [
  "costs.read", "profits.read", "finance.read", "payments.read", "cash.read", "reports.read",
];

const READ_ONLY_SAFE = READ_PERMISSION_KEYS.filter((k) => !SENSITIVE_READ.includes(k));

// Roles del sistema (plantillas). Se siembran como Role.isSystem=true.
// Los permisos reales SIEMPRE se resuelven desde estas definiciones (RBAC central).
export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    key: "organization_owner",
    name: "Organization Owner",
    description: "Control total de la organización",
    permissions: "ALL",
  },
  {
    key: "organization_admin",
    name: "Organization Admin",
    description: "Administración completa salvo propiedad de la organización",
    permissions: ALL_PERMISSION_KEYS.filter((k) => k !== "organization.manage"),
  },
  {
    key: "operations_manager",
    name: "Operations Manager",
    description: "Operación de catálogo, inventario, precios y transferencias",
    permissions: [
      "users.read",
      "branches.read", "branches.create", "branches.update",
      "warehouses.read", "warehouses.create", "warehouses.update",
      "catalog.read", "catalog.manage",
      "brands.read", "brands.manage",
      "categories.read", "categories.manage",
      "flavors.read", "flavors.manage",
      "products.read", "products.manage", "products.create", "products.update", "products.archive",
      "pricing.read", "pricing.manage",
      "inventory.read", "inventory.movement.read", "inventory.adjust", "inventory.adjust.approve",
      "inventory.reserve",
      "inventory.transfer.create", "inventory.transfer.approve", "inventory.transfer.ship", "inventory.transfer.receive",
      "inventory.count", "inventory.count.approve",
      "suppliers.read", "suppliers.manage", "purchasing.read",
      "purchase.order.create", "purchase.order.approve", "purchase.receipt.post", "purchase.return",
      "customers.read", "customers.manage",
      "orders.read", "orders.create", "orders.cancel", "orders.confirm", "orders.fulfill",
      "sales.note.read", "sales.note.issue", "sales.note.cancel",
      "sales.credit.read", "sales.credit.issue",
      "payments.read", "cash.read", "cash.manage", "cash.session.open", "cash.session.close", "cash.movement",
      "finance.read", "profits.read", "reports.read",
    ],
  },
  {
    key: "branch_manager",
    name: "Branch Manager",
    description: "Gestión de una sucursal",
    permissions: [
      "users.read",
      "branches.read", "branches.update",
      "warehouses.read", "warehouses.create",
      "catalog.read", "brands.read", "categories.read", "flavors.read",
      "products.read",
      "pricing.read",
      "inventory.read", "inventory.movement.read", "inventory.adjust", "inventory.reserve",
      "inventory.transfer.create", "inventory.transfer.receive",
      "inventory.count",
      "customers.read", "customers.manage",
      "orders.read", "orders.create", "orders.cancel", "orders.confirm", "orders.fulfill",
      "sales.note.read", "sales.note.issue", "sales.note.cancel",
      "sales.credit.read", "sales.credit.issue",
      "payments.read", "payments.record", "payments.reverse",
      "cash.read", "cash.manage", "cash.session.open", "cash.session.close", "cash.movement",
      "profits.read", "reports.read",
    ],
  },
  {
    key: "warehouse_manager",
    name: "Warehouse Manager",
    description: "Inventario completo (sin acceso a costos financieros)",
    permissions: [
      "warehouses.read", "warehouses.create", "warehouses.update",
      "catalog.read", "brands.read", "categories.read", "flavors.read",
      "products.read",
      "pricing.read",
      "inventory.read", "inventory.movement.read", "inventory.adjust", "inventory.adjust.approve",
      "inventory.reserve",
      "inventory.transfer.create", "inventory.transfer.approve", "inventory.transfer.ship", "inventory.transfer.receive",
      "inventory.count", "inventory.count.approve",
      "suppliers.read", "purchasing.read", "purchase.receipt.post",
      "orders.read", "orders.fulfill",
    ],
  },
  {
    key: "warehouse_operator",
    name: "Warehouse Operator",
    description: "Operación básica de almacén: lectura, conteo y recepción",
    permissions: [
      "warehouses.read",
      "catalog.read", "products.read",
      "inventory.read", "inventory.movement.read",
      "inventory.count", "inventory.reserve", "inventory.transfer.receive",
      "orders.read", "orders.fulfill",
    ],
  },
  {
    key: "sales_agent",
    name: "Sales Agent",
    description: "Ventas de mostrador (sin costos ni ajustes)",
    permissions: [
      "catalog.read", "products.read", "pricing.read", "inventory.read",
      "customers.read", "customers.manage",
      "orders.read", "orders.create", "orders.confirm",
      "sales.note.read", "sales.note.issue",
      "sales.credit.read",
      "payments.read", "payments.record", "cash.read",
    ],
  },
  {
    key: "wholesale_executive",
    name: "Wholesale Executive",
    description: "Ventas de mayoreo",
    permissions: [
      "catalog.read", "products.read", "pricing.read", "inventory.read",
      "customers.read", "customers.manage",
      "orders.read", "orders.create", "orders.cancel", "orders.confirm", "orders.fulfill",
      "sales.note.read", "sales.note.issue",
      "sales.credit.read",
      "payments.read", "payments.record", "cash.read",
      "finance.read",
    ],
  },
  {
    key: "cashier",
    name: "Cashier",
    description: "Cobro en caja",
    permissions: [
      "catalog.read", "products.read", "pricing.read",
      "customers.read",
      "orders.read", "orders.create", "orders.confirm", "orders.fulfill",
      "sales.note.read", "sales.note.issue",
      "sales.credit.read", "sales.credit.issue",
      "payments.read", "payments.record",
      "cash.read", "cash.session.open", "cash.session.close", "cash.movement",
      "finance.read", "reports.read",
    ],
  },
  {
    key: "driver",
    name: "Driver",
    description: "Reparto de pedidos",
    permissions: ["orders.read"],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Finanzas, costos y utilidades (sin operar inventario)",
    permissions: [
      "finance.read", "profits.read",
      "costs.read", "costs.manage",
      "pricing.read",
      "suppliers.read", "purchasing.read",
      "products.read", "inventory.read", "inventory.movement.read",
      "customers.read",
      "orders.read", "sales.note.read", "sales.credit.read", "payments.read", "cash.read", "reports.read", "audit.read",
    ],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Solo lectura (incluye financiero) + auditoría",
    permissions: [...READ_PERMISSION_KEYS, "audit.read"],
  },
  {
    key: "read_only",
    name: "Read Only",
    description: "Solo lectura no sensible (sin costos ni finanzas)",
    permissions: READ_ONLY_SAFE,
  },
];

// Resuelve la lista de permisos efectiva de un rol del sistema.
export function resolveRolePermissions(role: SystemRoleDefinition): PermissionKey[] {
  return role.permissions === "ALL" ? [...ALL_PERMISSION_KEYS] : role.permissions;
}
