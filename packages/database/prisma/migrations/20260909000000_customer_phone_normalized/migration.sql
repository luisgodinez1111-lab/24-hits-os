-- Identidad/búsqueda del cliente por WhatsApp: llave normalizada = últimos 10 dígitos
-- del teléfono (tolera +52 / 52 / 521 / espacios / guiones). Idempotente.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;

-- Backfill de clientes existentes: quita todo lo que no sea dígito y toma los últimos 10.
UPDATE "Customer"
   SET "phoneNormalized" = RIGHT(regexp_replace("phone", '\D', '', 'g'), 10)
 WHERE "phone" IS NOT NULL AND "phone" <> '' AND "phoneNormalized" IS NULL;

CREATE INDEX IF NOT EXISTS "Customer_organizationId_phoneNormalized_idx"
    ON "Customer" ("organizationId", "phoneNormalized");
