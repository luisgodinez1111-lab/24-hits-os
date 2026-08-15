-- CRM de clientes: número de cliente, dirección, zona (Chihuahua) + analítica.

-- Enum de zona del estado.
CREATE TYPE "CustomerZone" AS ENUM ('NORTE', 'SUR', 'ESTE', 'OESTE', 'CENTRO');

-- Nuevos campos del cliente.
ALTER TABLE "Customer" ADD COLUMN "code" TEXT;
ALTER TABLE "Customer" ADD COLUMN "address" TEXT;
ALTER TABLE "Customer" ADD COLUMN "zone" "CustomerZone";

-- Número de cliente único por organización (NULLs no colisionan en Postgres).
CREATE UNIQUE INDEX "Customer_organizationId_code_key" ON "Customer" ("organizationId", "code");

-- Índice para segmentar/analizar por zona.
CREATE INDEX "Customer_organizationId_zone_idx" ON "Customer" ("organizationId", "zone");
