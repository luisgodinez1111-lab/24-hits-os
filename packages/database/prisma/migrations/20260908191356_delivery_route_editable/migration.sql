-- Ruta de hoy editable: orden manual + posponer paradas.
-- (Nota: se omitió a propósito el DROP INDEX de OrganizationMembership_defaultWarehouseId_idx
--  que Prisma sugirió por drift con índices de performance añadidos por SQL; esta migración
--  es solo aditiva.)

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryExcluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliverySequence" INTEGER;
