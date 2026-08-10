-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "paymentTermsDays" INTEGER,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSupplierReference" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "supplierSku" TEXT,
    "lastCost" DECIMAL(18,4),
    "leadTimeDays" INTEGER,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSupplierReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "notes" TEXT,
    "expectedDate" TIMESTAMP(3),
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "requestedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "orderedAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "orderedQuantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "number" TEXT NOT NULL,
    "status" "PurchaseReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "receivedByUserId" UUID NOT NULL,
    "postedAt" TIMESTAMP(3),
    "correlationId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceiptItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "purchaseReceiptId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "purchaseOrderItemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_organizationId_status_idx" ON "Supplier"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProductSupplierReference_organizationId_variantId_idx" ON "ProductSupplierReference"("organizationId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupplierReference_supplierId_variantId_key" ON "ProductSupplierReference"("supplierId", "variantId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_status_idx" ON "PurchaseOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_number_key" ON "PurchaseOrder"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_idempotencyKey_key" ON "PurchaseOrder"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_organizationId_variantId_idx" ON "PurchaseOrderItem"("organizationId", "variantId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_organizationId_status_idx" ON "PurchaseReceipt"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_supplierId_idx" ON "PurchaseReceipt"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseReceipt_purchaseOrderId_idx" ON "PurchaseReceipt"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_organizationId_number_key" ON "PurchaseReceipt"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_organizationId_idempotencyKey_key" ON "PurchaseReceipt"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_purchaseReceiptId_idx" ON "PurchaseReceiptItem"("purchaseReceiptId");

-- CreateIndex
CREATE INDEX "PurchaseReceiptItem_organizationId_variantId_idx" ON "PurchaseReceiptItem"("organizationId", "variantId");

-- AddForeignKey
ALTER TABLE "ProductSupplierReference" ADD CONSTRAINT "ProductSupplierReference_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "PurchaseReceiptItem_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (integridad)
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "chk_po_item" CHECK ("orderedQuantity" > 0 AND "unitCost" >= 0 AND "taxRate" >= 0 AND "receivedQuantity" >= 0);
ALTER TABLE "PurchaseReceiptItem" ADD CONSTRAINT "chk_pr_item" CHECK ("quantity" > 0 AND "unitCost" >= 0);
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "chk_po_totals" CHECK ("subtotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0);

-- ROW LEVEL SECURITY (aislamiento de tenant, ADR-004) — por tabla
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Supplier"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "ProductSupplierReference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductSupplierReference" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductSupplierReference"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "PurchaseOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseOrder"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "PurchaseOrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseOrderItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseOrderItem"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "PurchaseReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseReceipt"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "PurchaseReceiptItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseReceiptItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseReceiptItem"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
