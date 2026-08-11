-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentEntryStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'EXPENSE');

-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "registerId" UUID NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openingFloat" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "openedByUserId" UUID NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" UUID,
    "closedAt" TIMESTAMP(3),
    "expectedCash" DECIMAL(18,4),
    "countedCash" DECIMAL(18,4),
    "difference" DECIMAL(18,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "orderId" UUID,
    "cashSessionId" UUID,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "reference" TEXT,
    "status" "PaymentEntryStatus" NOT NULL DEFAULT 'COMPLETED',
    "reversalOfId" UUID,
    "reversedAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "correlationId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "cashSessionId" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_organizationId_code_key" ON "CashRegister"("organizationId", "code");

-- CreateIndex
CREATE INDEX "CashRegister_organizationId_branchId_idx" ON "CashRegister"("organizationId", "branchId");

-- CreateIndex
CREATE INDEX "CashSession_organizationId_status_idx" ON "CashSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CashSession_registerId_idx" ON "CashSession"("registerId");

-- Índice único PARCIAL: solo puede existir UNA sesión OPEN por caja (concurrencia).
CREATE UNIQUE INDEX "CashSession_one_open_per_register" ON "CashSession"("registerId") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_idempotencyKey_key" ON "Payment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_cashSessionId_idx" ON "Payment"("organizationId", "cashSessionId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_idx" ON "Payment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CashMovement_cashSessionId_idx" ON "CashMovement"("cashSessionId");

-- CreateIndex
CREATE INDEX "CashMovement_organizationId_idx" ON "CashMovement"("organizationId");

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints (integridad financiera)
ALTER TABLE "Payment" ADD CONSTRAINT "chk_payment_amount" CHECK ("amount" > 0);
ALTER TABLE "CashMovement" ADD CONSTRAINT "chk_cash_movement_amount" CHECK ("amount" > 0);
ALTER TABLE "CashSession" ADD CONSTRAINT "chk_cash_session" CHECK ("openingFloat" >= 0 AND ("countedCash" IS NULL OR "countedCash" >= 0));

-- ROW LEVEL SECURITY (aislamiento de tenant, ADR-004)
ALTER TABLE "CashRegister" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashRegister" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashRegister"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "CashSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashSession"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
ALTER TABLE "CashMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashMovement" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashMovement"
  USING (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid);
