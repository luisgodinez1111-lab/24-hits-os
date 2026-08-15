-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DISPATCHED', 'DELIVERED');

-- AlterTable: entrega a domicilio en el pedido
ALTER TABLE "Order"
  ADD COLUMN "deliveryAddress" TEXT,
  ADD COLUMN "deliveryPhone" TEXT,
  ADD COLUMN "deliveryNotes" TEXT,
  ADD COLUMN "deliveryLocationUrl" TEXT,
  ADD COLUMN "deliveryStatus" "DeliveryStatus";

-- AlterTable: almacén fijo por usuario (membresía)
ALTER TABLE "OrganizationMembership" ADD COLUMN "defaultWarehouseId" UUID;

-- CreateIndex
CREATE INDEX "OrganizationMembership_defaultWarehouseId_idx" ON "OrganizationMembership"("defaultWarehouseId");

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_defaultWarehouseId_fkey"
  FOREIGN KEY ("defaultWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
