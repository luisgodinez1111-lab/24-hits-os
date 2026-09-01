-- Índices de rendimiento multi-tenant (lideran por organizationId). Sirven a las
-- consultas calientes de pedidos (lista por fecha, ruta de reparto por deliveryStatus,
-- cuentas por cobrar por paymentStatus) y de pagos (reportes por período). Aditivo.
--
-- Nota a escala: en tablas GRANDES conviene aplicarlos con CREATE INDEX CONCURRENTLY
-- (fuera de transacción) para no bloquear escrituras. Con el volumen actual, el
-- CREATE INDEX normal es instantáneo y suficiente.

-- CreateIndex
CREATE INDEX "Order_organizationId_createdAt_idx" ON "Order"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_organizationId_deliveryStatus_idx" ON "Order"("organizationId", "deliveryStatus");

-- CreateIndex
CREATE INDEX "Order_organizationId_paymentStatus_idx" ON "Order"("organizationId", "paymentStatus");

-- CreateIndex
CREATE INDEX "Payment_organizationId_createdAt_idx" ON "Payment"("organizationId", "createdAt");
