-- Coordenadas de entrega (para ruta por cercanía) y última ubicación del cliente.
ALTER TABLE "Order" ADD COLUMN "deliveryLat" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "deliveryLng" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN "lng" DOUBLE PRECISION;
