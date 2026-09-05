-- Dispatch: repartidor asignado a la entrega (null = pool común).
ALTER TABLE "Order" ADD COLUMN "assignedDriverId" UUID;
CREATE INDEX "Order_organizationId_assignedDriverId_idx" ON "Order" ("organizationId", "assignedDriverId");
