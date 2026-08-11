-- AlterEnum
ALTER TYPE "CostSourceType" ADD VALUE 'SALE_RETURN';

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterTable (snapshot de costo en el renglón de la nota de venta, para revertir COGS)
ALTER TABLE "SaleNoteItem" ADD COLUMN "unitCostSnapshot" DECIMAL(18,4);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "orderId" UUID,
    "saleNoteId" UUID,
    "customerId" UUID,
    "series" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "customerName" TEXT,
    "customerTaxId" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "discountTotal" DECIMAL(18,4) NOT NULL,
    "taxTotal" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "refundMethod" "PaymentMethod",
    "refundCashSessionId" UUID,
    "issuedByUserId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNoteItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "creditNoteId" UUID NOT NULL,
    "saleNoteItemId" UUID,
    "variantId" UUID,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "unitCostSnapshot" DECIMAL(18,4),

    CONSTRAINT "CreditNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_organizationId_series_folio_key" ON "CreditNote"("organizationId", "series", "folio");

-- CreateIndex
CREATE INDEX "CreditNote_organizationId_status_idx" ON "CreditNote"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CreditNote_saleNoteId_idx" ON "CreditNote"("saleNoteId");

-- CreateIndex
CREATE INDEX "CreditNote_orderId_idx" ON "CreditNote"("orderId");

-- CreateIndex
CREATE INDEX "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");

-- CreateIndex
CREATE INDEX "CreditNoteItem_organizationId_saleNoteItemId_idx" ON "CreditNoteItem"("organizationId", "saleNoteItemId");

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_saleNoteId_fkey" FOREIGN KEY ("saleNoteId") REFERENCES "SaleNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (integridad)
ALTER TABLE "CreditNote" ADD CONSTRAINT "chk_credit_note_totals" CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0 AND "folio" > 0);
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "chk_credit_note_item" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "taxRate" >= 0 AND "lineTotal" >= 0);

-- ROW LEVEL SECURITY (aislamiento de tenant, ADR-004)
ALTER TABLE "CreditNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CreditNote"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "CreditNoteItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditNoteItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CreditNoteItem"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
