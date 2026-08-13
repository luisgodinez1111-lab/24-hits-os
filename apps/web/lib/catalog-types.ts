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

export interface CashRegister {
  id: string;
  branchId: string;
  name: string;
  code: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface CashSession {
  id: string;
  registerId: string;
  status: "OPEN" | "CLOSED";
  openingFloat: string;
  openedAt: string;
  closedAt: string | null;
  expectedCash: string | null;
  countedCash: string | null;
  difference: string | null;
  expectedCashLive?: string;
  movements?: Array<{ id: string; type: "DEPOSIT" | "WITHDRAWAL" | "EXPENSE"; amount: string; reason: string; createdAt: string }>;
}

export interface Payment {
  id: string;
  orderId: string | null;
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  amount: string;
  currency: string;
  reference: string | null;
  status: "COMPLETED" | "REVERSED";
  createdAt: string;
}

export interface SalesSummary {
  from: string;
  to: string;
  billed: string;
  collected: string;
  outstanding: string;
  orderCount: number;
  avgTicket: string;
  byPaymentMethod: Record<"CASH" | "CARD" | "TRANSFER" | "OTHER", string>;
  // Solo presentes si el usuario tiene profits.read (filtrado en el backend).
  revenueNet?: string;
  cogs?: string;
  grossProfit?: string;
  margin?: string;
}

export interface SalesRegisterRow {
  orderId: string;
  number: string;
  date: string;
  status: string;
  paymentStatus: "PENDING" | "PARTIAL" | "PAID";
  customerName: string | null;
  total: string;
  paid: string;
  balance: string;
  methods: string[];
  saleNoteNumber: string | null;
  cogs?: string;
  grossProfit?: string;
}
export interface SalesRegister {
  rows: SalesRegisterRow[];
  totals: {
    count: number;
    billed: string;
    collected: string;
    outstanding: string;
    cogs?: string;
    grossProfit?: string;
  };
}

export interface ProfitByProductRow {
  variantId: string;
  sku: string | null;
  name: string | null;
  quantity: string;
  revenue: string;
  cogs: string;
  grossProfit: string;
  margin: string;
}

export interface SaleNote {
  id: string;
  orderId: string | null;
  series: string;
  folio: number;
  number: string;
  status: "ISSUED" | "CANCELLED";
  currency: string;
  customerName: string | null;
  customerTaxId: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  paidTotal: string;
  notes: string | null;
  issuedAt: string;
  cancelledAt: string | null;
  cancelledReason: string | null;
  items?: Array<{
    id: string;
    sku: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    taxRate: string;
    lineTotal: string;
  }>;
}

export interface AppNotification {
  id: string;
  type: "LOW_STOCK" | "INVENTORY_DRIFT" | "PAYMENT_PENDING" | "SYSTEM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface CreditNote {
  id: string;
  saleNoteId: string | null;
  orderId: string | null;
  series: string;
  folio: number;
  number: string;
  status: "ISSUED" | "CANCELLED";
  currency: string;
  customerName: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  reason: string;
  refundMethod: "CASH" | "CARD" | "TRANSFER" | "OTHER" | null;
  issuedAt: string;
  items?: Array<{
    id: string;
    saleNoteItemId: string | null;
    sku: string | null;
    description: string;
    quantity: string;
    unitPrice: string;
    taxRate: string;
    lineTotal: string;
  }>;
}
