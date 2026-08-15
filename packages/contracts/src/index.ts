// Contratos compartidos entre API y web (formato de respuesta, tipos de dominio
// expuestos al cliente). No incluye lógica ni dependencias de framework.

export type { PermissionKey } from "@24hits/auth";

// Formato de error estándar de la API.
export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown };
  correlationId: string | null;
}

export interface Membership {
  id: string;
  organization: { id: string; name: string; slug: string; status: string };
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  phone: string | null;
  address: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

export interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  device: string | null;
  organizationId: string | null;
  createdAt: string;
  lastUsedAt: string;
}

export type WarehouseType = "MAIN" | "COUNTER" | "DELIVERY";

export interface Warehouse {
  id: string;
  organizationId: string;
  branchId: string;
  name: string;
  code: string;
  type: WarehouseType;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export interface Member {
  id: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  createdAt: string;
  user: { id: string; email: string; name: string | null; status: "ACTIVE" | "DISABLED" };
  roles: Array<{ role: { id: string; key: string; name: string } }>;
  defaultWarehouse: { id: string; name: string } | null;
}

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  organizationId: string | null;
  permissions: Array<{ permission: { key: string } }>;
  _count: { membershipRoles: number };
}

export interface PermissionCatalogGroup {
  category: string;
  permissions: Array<{ key: string; category: string; description?: string }>;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  correlationId: string | null;
  createdAt: string;
  metadata: unknown;
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor: string | null;
}

export interface OrganizationSettings {
  id: string;
  organizationId: string;
  timezone: string;
  defaultCurrency: string;
  negativeInventoryAllowed: boolean;
  defaultPaymentCommission: string;
  deliveryCutoffTime: string | null;
  orderNumberPrefix: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
}
