-- Prueba de entrega (geo-sello): ubicación/hora/quién al marcar DELIVERED.
-- Evidencia difícil de falsear de que el repartidor estuvo en el punto de entrega.
ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "deliveredLat" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveredLng" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveredAccuracy" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveredByUserId" UUID;
ALTER TABLE "Order" ADD COLUMN "deliveryRecipient" TEXT;
