-- CreateEnum
CREATE TYPE "SaleNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "series" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "orderId" UUID,
    "customerId" UUID,
    "series" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SaleNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "customerName" TEXT,
    "customerTaxId" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL,
    "discountTotal" DECIMAL(18,4) NOT NULL,
    "taxTotal" DECIMAL(18,4) NOT NULL,
    "total" DECIMAL(18,4) NOT NULL,
    "paidTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedByUserId" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledByUserId" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancelledReason" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleNoteItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "saleNoteId" UUID NOT NULL,
    "variantId" UUID,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "SaleNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_organizationId_series_key" ON "DocumentSequence"("organizationId", "series");

-- CreateIndex
CREATE UNIQUE INDEX "SaleNote_organizationId_series_folio_key" ON "SaleNote"("organizationId", "series", "folio");

-- CreateIndex
CREATE INDEX "SaleNote_organizationId_status_idx" ON "SaleNote"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SaleNote_orderId_idx" ON "SaleNote"("orderId");

-- CreateIndex
CREATE INDEX "SaleNoteItem_saleNoteId_idx" ON "SaleNoteItem"("saleNoteId");

-- AddForeignKey
ALTER TABLE "SaleNote" ADD CONSTRAINT "SaleNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleNoteItem" ADD CONSTRAINT "SaleNoteItem_saleNoteId_fkey" FOREIGN KEY ("saleNoteId") REFERENCES "SaleNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (integridad)
ALTER TABLE "SaleNote" ADD CONSTRAINT "chk_sale_note_totals" CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0 AND "paidTotal" >= 0 AND "folio" > 0);
ALTER TABLE "SaleNoteItem" ADD CONSTRAINT "chk_sale_note_item" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "discount" >= 0 AND "taxRate" >= 0 AND "lineTotal" >= 0);
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "chk_document_sequence" CHECK ("nextValue" >= 1);

-- ROW LEVEL SECURITY (aislamiento de tenant, ADR-004)
ALTER TABLE "DocumentSequence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentSequence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DocumentSequence"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "SaleNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SaleNote"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "SaleNoteItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleNoteItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SaleNoteItem"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
