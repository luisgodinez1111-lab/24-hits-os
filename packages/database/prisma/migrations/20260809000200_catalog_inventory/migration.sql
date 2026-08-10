-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "BarcodeType" AS ENUM ('EAN', 'UPC', 'CODE128', 'QR_INTERNAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PriceListType" AS ENUM ('RETAIL', 'WHOLESALE', 'SPECIAL');

-- CreateEnum
CREATE TYPE "PriceListStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CostSourceType" AS ENUM ('OPENING_BALANCE', 'MANUAL_COST_INITIALIZATION', 'ADJUSTMENT_COST', 'PURCHASE_RECEIPT');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING_BALANCE', 'MANUAL_IN', 'MANUAL_OUT', 'PURCHASE_RECEIPT', 'SALE', 'SALE_REVERSAL', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'RESERVATION', 'RESERVATION_RELEASE', 'ALLOCATION', 'ALLOCATION_RELEASE', 'DAMAGE', 'LOSS', 'THEFT', 'SAMPLE', 'WARRANTY_OUT', 'WARRANTY_IN', 'COUNT_ADJUSTMENT_IN', 'COUNT_ADJUSTMENT_OUT', 'INTERNAL_CONSUMPTION', 'QUARANTINE_IN', 'QUARANTINE_OUT');

-- CreateEnum
CREATE TYPE "MovementDirection" AS ENUM ('IN', 'OUT', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "ReasonCode" AS ENUM ('DATA_CORRECTION', 'DAMAGE', 'LOSS', 'THEFT', 'INITIAL_COUNT', 'COUNT_DIFFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockCountType" AS ENUM ('FULL', 'CYCLE', 'CATEGORY', 'BRAND', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateEnum
CREATE TYPE "AdjustmentSourceType" AS ENUM ('MANUAL', 'STOCK_COUNT');

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parentCategoryId" UUID,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flavor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flavor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "brandId" UUID,
    "categoryId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "flavorId" UUID,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "purchaseUnitId" UUID NOT NULL,
    "salesUnitId" UUID NOT NULL,
    "unitsPerPurchaseUnit" INTEGER NOT NULL DEFAULT 1,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowBackorder" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBarcode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "barcode" TEXT NOT NULL,
    "type" "BarcodeType" NOT NULL DEFAULT 'OTHER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PriceListType" NOT NULL DEFAULT 'RETAIL',
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "status" "PriceListStatus" NOT NULL DEFAULT 'ACTIVE',
    "branchId" UUID,
    "customerSegment" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceListItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "minimumPrice" DECIMAL(18,4),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "priceListId" UUID,
    "oldPrice" DECIMAL(18,4),
    "newPrice" DECIMAL(18,4) NOT NULL,
    "changedByUserId" UUID,
    "reason" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantCost" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "averageCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lastPurchaseCost" DECIMAL(18,4),
    "quantityOnHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostHistory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "oldAverageCost" DECIMAL(18,4),
    "newAverageCost" DECIMAL(18,4) NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "sourceType" "CostSourceType" NOT NULL,
    "changedByUserId" UUID,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "direction" "MovementDirection" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "totalCost" DECIMAL(18,4),
    "referenceType" TEXT,
    "referenceId" UUID,
    "reasonCode" "ReasonCode",
    "reasonText" TEXT,
    "createdByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "correlationId" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "onHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "allocated" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "damaged" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "quarantine" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "inTransitIncoming" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "inTransitOutgoing" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "referenceType" TEXT,
    "referenceId" UUID,
    "expiresAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "referenceType" TEXT,
    "referenceId" UUID,
    "idempotencyKey" TEXT,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPolicy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "minimumStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "safetyStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(18,6),
    "targetStock" DECIMAL(18,6),
    "leadTimeDays" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseTransfer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "sourceWarehouseId" UUID NOT NULL,
    "destinationWarehouseId" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" UUID,
    "approvedByUserId" UUID,
    "shippedByUserId" UUID,
    "receivedByUserId" UUID,
    "requestedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "correlationId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseTransferItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "requestedQuantity" DECIMAL(18,6) NOT NULL,
    "shippedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "receivedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitCostSnapshot" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "type" "StockCountType" NOT NULL DEFAULT 'CUSTOM',
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "blindCount" BOOLEAN NOT NULL DEFAULT false,
    "startedByUserId" UUID,
    "approvedByUserId" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "expectedQuantity" DECIMAL(18,6) NOT NULL,
    "countedQuantity" DECIMAL(18,6),
    "difference" DECIMAL(18,6),
    "notes" TEXT,
    "countedByUserId" UUID,
    "countedAt" TIMESTAMP(3),

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdjustmentRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "direction" "MovementDirection" NOT NULL,
    "reasonCode" "ReasonCode" NOT NULL,
    "reasonText" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "sourceType" "AdjustmentSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceId" UUID,
    "requestedByUserId" UUID NOT NULL,
    "approvedByUserId" UUID,
    "appliedMovementId" UUID,
    "idempotencyKey" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdjustmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brand_organizationId_status_idx" ON "Brand"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_organizationId_slug_key" ON "Brand"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Category_organizationId_status_idx" ON "Category"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Category_parentCategoryId_idx" ON "Category"("parentCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_slug_key" ON "Category"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Flavor_organizationId_status_idx" ON "Flavor"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Flavor_organizationId_normalizedName_key" ON "Flavor"("organizationId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_organizationId_code_key" ON "UnitOfMeasure"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Product_organizationId_status_idx" ON "Product"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_slug_key" ON "Product"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ProductVariant_organizationId_status_idx" ON "ProductVariant"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_flavorId_idx" ON "ProductVariant"("flavorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_organizationId_sku_key" ON "ProductVariant"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "ProductBarcode_barcode_idx" ON "ProductBarcode"("barcode");

-- CreateIndex
CREATE INDEX "ProductBarcode_variantId_idx" ON "ProductBarcode"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBarcode_organizationId_barcode_key" ON "ProductBarcode"("organizationId", "barcode");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_variantId_idx" ON "ProductImage"("variantId");

-- CreateIndex
CREATE INDEX "PriceList_organizationId_type_status_idx" ON "PriceList"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "PriceListItem_organizationId_variantId_idx" ON "PriceListItem"("organizationId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceListItem_priceListId_variantId_validFrom_key" ON "PriceListItem"("priceListId", "variantId", "validFrom");

-- CreateIndex
CREATE INDEX "PriceHistory_organizationId_variantId_createdAt_idx" ON "PriceHistory"("organizationId", "variantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VariantCost_variantId_key" ON "VariantCost"("variantId");

-- CreateIndex
CREATE INDEX "VariantCost_organizationId_idx" ON "VariantCost"("organizationId");

-- CreateIndex
CREATE INDEX "CostHistory_organizationId_variantId_createdAt_idx" ON "CostHistory"("organizationId", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_warehouseId_variantId_crea_idx" ON "InventoryMovement"("organizationId", "warehouseId", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_variantId_createdAt_idx" ON "InventoryMovement"("organizationId", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_movementType_createdAt_idx" ON "InventoryMovement"("organizationId", "movementType", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx" ON "InventoryMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryMovement_correlationId_idx" ON "InventoryMovement"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_organizationId_idempotencyKey_key" ON "InventoryMovement"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryBalance_organizationId_variantId_idx" ON "InventoryBalance"("organizationId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_organizationId_warehouseId_variantId_key" ON "InventoryBalance"("organizationId", "warehouseId", "variantId");

-- CreateIndex
CREATE INDEX "InventoryReservation_organizationId_warehouseId_variantId_s_idx" ON "InventoryReservation"("organizationId", "warehouseId", "variantId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_status_expiresAt_idx" ON "InventoryReservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_organizationId_idempotencyKey_key" ON "InventoryReservation"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryAllocation_organizationId_warehouseId_variantId_st_idx" ON "InventoryAllocation"("organizationId", "warehouseId", "variantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAllocation_organizationId_idempotencyKey_key" ON "InventoryAllocation"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryPolicy_organizationId_warehouseId_variantId_key" ON "InventoryPolicy"("organizationId", "warehouseId", "variantId");

-- CreateIndex
CREATE INDEX "WarehouseTransfer_organizationId_status_idx" ON "WarehouseTransfer"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WarehouseTransferItem_transferId_idx" ON "WarehouseTransferItem"("transferId");

-- CreateIndex
CREATE INDEX "WarehouseTransferItem_organizationId_variantId_idx" ON "WarehouseTransferItem"("organizationId", "variantId");

-- CreateIndex
CREATE INDEX "StockCount_organizationId_status_idx" ON "StockCount"("organizationId", "status");

-- CreateIndex
CREATE INDEX "StockCountItem_stockCountId_idx" ON "StockCountItem"("stockCountId");

-- CreateIndex
CREATE INDEX "StockCountItem_organizationId_variantId_idx" ON "StockCountItem"("organizationId", "variantId");

-- CreateIndex
CREATE INDEX "AdjustmentRequest_organizationId_status_idx" ON "AdjustmentRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AdjustmentRequest_organizationId_warehouseId_variantId_idx" ON "AdjustmentRequest"("organizationId", "warehouseId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "AdjustmentRequest_organizationId_idempotencyKey_key" ON "AdjustmentRequest"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_flavorId_fkey" FOREIGN KEY ("flavorId") REFERENCES "Flavor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBarcode" ADD CONSTRAINT "ProductBarcode_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantCost" ADD CONSTRAINT "VariantCost_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseTransferItem" ADD CONSTRAINT "WarehouseTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "WarehouseTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- CHECK CONSTRAINTS (integridad a nivel BD — no depender solo del frontend)
-- ============================================================================
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "chk_movement_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "chk_reservation_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "InventoryAllocation" ADD CONSTRAINT "chk_allocation_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "AdjustmentRequest" ADD CONSTRAINT "chk_adjustment_qty_pos" CHECK ("quantity" > 0);
ALTER TABLE "WarehouseTransferItem" ADD CONSTRAINT "chk_transfer_item_qty" CHECK ("requestedQuantity" > 0 AND "shippedQuantity" >= 0 AND "receivedQuantity" >= 0);
ALTER TABLE "WarehouseTransfer" ADD CONSTRAINT "chk_transfer_diff_wh" CHECK ("sourceWarehouseId" <> "destinationWarehouseId");
ALTER TABLE "PriceListItem" ADD CONSTRAINT "chk_price_nonneg" CHECK ("price" >= 0 AND ("minimumPrice" IS NULL OR "minimumPrice" >= 0));
ALTER TABLE "VariantCost" ADD CONSTRAINT "chk_cost_nonneg" CHECK ("averageCost" >= 0);
-- El balance jamás puede tener columnas negativas (invariante de inventario).
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "chk_balance_nonneg" CHECK (
  "onHand" >= 0 AND "reserved" >= 0 AND "allocated" >= 0 AND "damaged" >= 0 AND
  "quarantine" >= 0 AND "inTransitIncoming" >= 0 AND "inTransitOutgoing" >= 0
);

-- ROW LEVEL SECURITY (aislamiento de tenant, ADR-004) — por tabla
ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brand" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Brand"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Category" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Category"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "Flavor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Flavor" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Flavor"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "UnitOfMeasure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UnitOfMeasure" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UnitOfMeasure"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductVariant"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "ProductBarcode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductBarcode" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductBarcode"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductImage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProductImage"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "PriceList" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceList" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceList"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "PriceListItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceListItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceListItem"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "PriceHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceHistory"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "VariantCost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VariantCost" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VariantCost"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "CostHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CostHistory"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryMovement"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "InventoryBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryBalance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryBalance"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "InventoryReservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryReservation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryReservation"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "InventoryAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryAllocation"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "InventoryPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InventoryPolicy"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "WarehouseTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarehouseTransfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WarehouseTransfer"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "WarehouseTransferItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarehouseTransferItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WarehouseTransferItem"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "StockCount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCount" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockCount"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "StockCountItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockCountItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockCountItem"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "AdjustmentRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdjustmentRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AdjustmentRequest"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
