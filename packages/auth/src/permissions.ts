// Catálogo CENTRAL de permisos "recurso.acción". Fuente de verdad de RBAC (ADR-006).
// Añadir un permiso aquí; nunca dispersar checks de rol por el código.

export const PERMISSIONS = [
  { key: "organization.manage", category: "organization", description: "Administrar la organización (datos, estado)" },

  { key: "users.read", category: "users", description: "Ver usuarios y membresías" },
  { key: "users.invite", category: "users", description: "Invitar usuarios" },
  { key: "users.manage", category: "users", description: "Gestionar usuarios (roles, desactivar)" },

  { key: "roles.read", category: "roles", description: "Ver roles y permisos" },
  { key: "roles.manage", category: "roles", description: "Crear/editar roles" },

  { key: "branches.read", category: "branches", description: "Ver sucursales" },
  { key: "branches.create", category: "branches", description: "Crear sucursales" },
  { key: "branches.update", category: "branches", description: "Editar sucursales" },

  { key: "warehouses.read", category: "warehouses", description: "Ver almacenes" },
  { key: "warehouses.create", category: "warehouses", description: "Crear almacenes" },
  { key: "warehouses.update", category: "warehouses", description: "Editar almacenes" },

  { key: "products.read", category: "products", description: "Ver productos" },
  { key: "products.manage", category: "products", description: "Gestionar productos" },

  { key: "inventory.read", category: "inventory", description: "Ver inventario" },
  { key: "inventory.adjust", category: "inventory", description: "Ajustar inventario" },

  { key: "orders.read", category: "orders", description: "Ver pedidos" },
  { key: "orders.create", category: "orders", description: "Crear pedidos" },
  { key: "orders.cancel", category: "orders", description: "Cancelar pedidos" },

  { key: "finance.read", category: "finance", description: "Ver finanzas" },
  { key: "profits.read", category: "finance", description: "Ver utilidades" },

  { key: "audit.read", category: "audit", description: "Ver auditoría" },

  // --- Catálogo (Prompt 2) ---
  { key: "catalog.read", category: "catalog", description: "Ver catálogo" },
  { key: "catalog.manage", category: "catalog", description: "Gestionar catálogo" },
  { key: "brands.read", category: "catalog", description: "Ver marcas" },
  { key: "brands.manage", category: "catalog", description: "Gestionar marcas" },
  { key: "categories.read", category: "catalog", description: "Ver categorías" },
  { key: "categories.manage", category: "catalog", description: "Gestionar categorías" },
  { key: "flavors.read", category: "catalog", description: "Ver sabores" },
  { key: "flavors.manage", category: "catalog", description: "Gestionar sabores" },
  { key: "products.create", category: "products", description: "Crear productos" },
  { key: "products.update", category: "products", description: "Editar productos" },
  { key: "products.archive", category: "products", description: "Archivar productos" },

  // --- Precios y costos ---
  { key: "pricing.read", category: "pricing", description: "Ver precios" },
  { key: "pricing.manage", category: "pricing", description: "Gestionar precios" },
  { key: "costs.read", category: "costs", description: "Ver costos (sensible)" },
  { key: "costs.manage", category: "costs", description: "Gestionar costos (sensible)" },

  // --- Inventario (Prompt 2) ---
  { key: "inventory.movement.read", category: "inventory", description: "Ver movimientos de inventario" },
  { key: "inventory.adjust.approve", category: "inventory", description: "Aprobar ajustes de inventario" },
  { key: "inventory.reserve", category: "inventory", description: "Reservar inventario" },
  { key: "inventory.transfer.create", category: "inventory", description: "Crear transferencias" },
  { key: "inventory.transfer.approve", category: "inventory", description: "Aprobar transferencias" },
  { key: "inventory.transfer.ship", category: "inventory", description: "Enviar transferencias" },
  { key: "inventory.transfer.receive", category: "inventory", description: "Recibir transferencias" },
  { key: "inventory.count", category: "inventory", description: "Realizar conteos físicos" },
  { key: "inventory.count.approve", category: "inventory", description: "Aprobar conteos físicos" },

  // --- Compras y proveedores (Prompt 3) ---
  { key: "suppliers.read", category: "purchasing", description: "Ver proveedores" },
  { key: "suppliers.manage", category: "purchasing", description: "Gestionar proveedores" },
  { key: "purchasing.read", category: "purchasing", description: "Ver compras" },
  { key: "purchase.order.create", category: "purchasing", description: "Crear órdenes de compra" },
  { key: "purchase.order.approve", category: "purchasing", description: "Aprobar órdenes de compra" },
  { key: "purchase.receipt.post", category: "purchasing", description: "Postear recepciones de compra" },
  { key: "purchase.return", category: "purchasing", description: "Devoluciones a proveedor" },

  // --- Ventas y pedidos (Prompt 4) ---
  { key: "customers.read", category: "sales", description: "Ver clientes" },
  { key: "customers.manage", category: "sales", description: "Gestionar clientes" },
  { key: "orders.confirm", category: "sales", description: "Confirmar pedidos (reservar stock)" },
  { key: "orders.fulfill", category: "sales", description: "Entregar pedidos (consumir stock)" },

  // --- Pagos y caja (Prompt 5) ---
  { key: "payments.read", category: "payments", description: "Ver pagos" },
  { key: "payments.record", category: "payments", description: "Registrar cobros" },
  { key: "payments.reverse", category: "payments", description: "Anular cobros (sensible)" },
  { key: "cash.read", category: "cash", description: "Ver cajas y turnos" },
  { key: "cash.manage", category: "cash", description: "Administrar cajas (alta/baja)" },
  { key: "cash.session.open", category: "cash", description: "Abrir turno de caja" },
  { key: "cash.session.close", category: "cash", description: "Cerrar turno de caja (arqueo)" },
  { key: "cash.movement", category: "cash", description: "Registrar movimientos de efectivo" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

// Subconjunto de solo lectura (todas las acciones ".read"). Útil para roles Auditor/Read Only.
export const READ_PERMISSION_KEYS: PermissionKey[] = ALL_PERMISSION_KEYS.filter((k) =>
  k.endsWith(".read")
);
