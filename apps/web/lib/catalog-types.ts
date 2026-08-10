// Tipos que devuelve la API de catálogo/inventario (Decimal serializa como string).

export interface Brand {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE";
}
export interface Category {
  id: string;
  name: string;
  slug: string;
  parentCategoryId: string | null;
}
export interface Flavor {
  id: string;
  name: string;
}
export interface Unit {
  id: string;
  code: string;
  name: string;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  updatedAt: string;
  brand: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  _count: { variants: number };
}
export interface ProductPage {
  items: ProductListItem[];
  nextCursor: string | null;
}

export interface Variant {
  id: string;
  sku: string;
  name: string;
  status: string;
  flavor?: { name: string } | null;
  barcodes?: Array<{ barcode: string; type: string }>;
}

export interface InventoryBalanceRow {
  variantId: string;
  warehouseId: string;
  sku: string | null;
  product: string | null;
  flavor: string | null;
  onHand: string;
  reserved: string;
  available: string;
  damaged: string;
  inTransitIncoming: string;
  minimumStock: string | null;
  reorderStatus: "OK" | "LOW" | "OUT_OF_STOCK";
}

export interface InventoryMovement {
  id: string;
  createdAt: string;
  variantId: string;
  warehouseId: string;
  movementType: string;
  direction: "IN" | "OUT" | "NEUTRAL";
  quantity: string;
  reasonCode: string | null;
  correlationId: string | null;
}
export interface MovementPage {
  items: InventoryMovement[];
  nextCursor: string | null;
}

export interface Transfer {
  id: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  status: string;
  createdAt: string;
  items: Array<{
    id: string;
    variantId: string;
    requestedQuantity: string;
    shippedQuantity: string;
    receivedQuantity: string;
  }>;
}

export interface StockCount {
  id: string;
  warehouseId: string;
  type: string;
  status: string;
  blindCount: boolean;
  createdAt: string;
  items?: Array<{
    id: string;
    variantId: string;
    expectedQuantity: string | null;
    countedQuantity: string | null;
    difference: string | null;
  }>;
}

export interface PriceList {
  id: string;
  name: string;
  type: "RETAIL" | "WHOLESALE" | "SPECIAL";
  currency: string;
  status: string;
}

export interface Supplier {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  warehouseId: string;
  number: string;
  status: string;
  currency: string;
  total: string;
  createdAt: string;
  items: Array<{
    id: string;
    variantId: string;
    orderedQuantity: string;
    unitCost: string;
    receivedQuantity: string;
  }>;
}

export interface Customer {
  id: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  type: "RETAIL" | "WHOLESALE";
  creditLimit: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface Order {
  id: string;
  customerId: string | null;
  warehouseId: string;
  number: string;
  status: "DRAFT" | "CONFIRMED" | "PARTIALLY_FULFILLED" | "FULFILLED" | "COMPLETED" | "CANCELLED";
  currency: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  paymentStatus: "PENDING" | "PARTIAL" | "PAID";
  createdAt: string;
  items: Array<{
    id: string;
    variantId: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate: string;
    lineTotal: string;
    fulfilledQuantity: string;
    unitCostSnapshot: string | null;
  }>;
}
