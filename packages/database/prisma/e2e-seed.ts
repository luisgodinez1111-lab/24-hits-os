import { createPrismaClient, withSystem } from "../src/client.js";

// Datos DETERMINISTAS para los E2E (POS + reparto). Idempotente: se puede correr N
// veces. Requiere `pnpm db:seed` antes (usa la org/owner/sucursal/almacén dev).
//   pnpm db:seed-e2e
const prisma = createPrismaClient();

const SKU = "E2E-SKU-1";
const BARCODE = "E2E-TEST-0001";
const PRICE = "100";
const ORDER_NUMBER = "E2E-DELIV-1";
// Coordenadas en Chihuahua para el pedido de reparto.
const LAT = 28.6353;
const LNG = -106.0889;

async function main(): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { slug: "24-hits" }, select: { id: true } });
  if (!org) throw new Error("Falta la organización dev. Corre `pnpm db:seed` primero.");
  const organizationId = org.id;

  await withSystem(prisma, async (tx) => {
    const branch = await tx.branch.findFirst({ where: { organizationId, code: "MAIN" }, select: { id: true } });
    const warehouse = await tx.warehouse.findFirst({ where: { organizationId, code: "MAIN" }, select: { id: true } });
    const user = await tx.user.findUnique({ where: { email: "owner@example.local" }, select: { id: true } });
    if (!branch || !warehouse || !user) throw new Error("Faltan branch/warehouse/owner dev. Corre `pnpm db:seed`.");
    const branchId = branch.id;
    const warehouseId = warehouse.id;
    const userId = user.id;

    // 1) Almacén por defecto en la membresía del owner (el POS lo exige).
    const membership = await tx.organizationMembership.findFirst({ where: { organizationId, userId }, select: { id: true } });
    if (membership) {
      await tx.organizationMembership.update({ where: { id: membership.id }, data: { defaultWarehouseId: warehouseId } });
    }

    // 2) Unidad + producto + variante E2E.
    const unit =
      (await tx.unitOfMeasure.findFirst({ where: { organizationId, code: "PIECE" }, select: { id: true } })) ??
      (await tx.unitOfMeasure.create({ data: { organizationId, code: "PIECE", name: "Pieza" }, select: { id: true } }));
    const product =
      (await tx.product.findFirst({ where: { organizationId, slug: "e2e-producto" }, select: { id: true } })) ??
      (await tx.product.create({ data: { organizationId, name: "E2E Producto", slug: "e2e-producto", status: "ACTIVE" }, select: { id: true } }));
    const variant =
      (await tx.productVariant.findFirst({ where: { organizationId, sku: SKU }, select: { id: true } })) ??
      (await tx.productVariant.create({
        data: { organizationId, productId: product.id, sku: SKU, name: "E2E Variante", purchaseUnitId: unit.id, salesUnitId: unit.id },
        select: { id: true },
      }));
    const variantId = variant.id;

    // 3) Código de barras (lo que POS escanea/teclea).
    if (!(await tx.productBarcode.findFirst({ where: { organizationId, barcode: BARCODE }, select: { id: true } }))) {
      await tx.productBarcode.create({ data: { organizationId, variantId, barcode: BARCODE, isPrimary: true } });
    }

    // 4) Lista de precios RETAIL activa + precio de la variante.
    const list =
      (await tx.priceList.findFirst({ where: { organizationId, type: "RETAIL", status: "ACTIVE" }, select: { id: true } })) ??
      (await tx.priceList.create({ data: { organizationId, name: "Lista RETAIL E2E", type: "RETAIL", status: "ACTIVE" }, select: { id: true } }));
    if (!(await tx.priceListItem.findFirst({ where: { organizationId, priceListId: list.id, variantId }, select: { id: true } }))) {
      await tx.priceListItem.create({ data: { organizationId, priceListId: list.id, variantId, price: PRICE } });
    }

    // 5) Stock: onHand suficiente para el POS y para el confirm del reparto.
    const bal = await tx.inventoryBalance.findFirst({ where: { organizationId, warehouseId, variantId }, select: { id: true } });
    if (bal) await tx.inventoryBalance.update({ where: { id: bal.id }, data: { onHand: 100, reserved: 0 } });
    else await tx.inventoryBalance.create({ data: { organizationId, branchId, warehouseId, variantId, onHand: 100 } });

    // 6) Cliente con coordenadas (para que el reparto tenga destino en el mapa).
    const customer =
      (await tx.customer.findFirst({ where: { organizationId, name: "Cliente E2E" }, select: { id: true } })) ??
      (await tx.customer.create({ data: { organizationId, name: "Cliente E2E", lat: LAT, lng: LNG }, select: { id: true } }));

    // 7) Pedido de reparto. Se RECREA fresco en cada corrida (determinismo: si el E2E
    //    ya lo entregó antes, vuelve a quedar entregable). DRAFT con coordenadas →
    //    aparece en la Ruta; al "Entregar" se confirma + entrega + cobra por el flujo real.
    const prev = await tx.order.findFirst({ where: { organizationId, number: ORDER_NUMBER }, select: { id: true } });
    if (prev) {
      await tx.payment.deleteMany({ where: { orderId: prev.id } });
      await tx.inventoryReservation.deleteMany({ where: { organizationId, referenceType: "ORDER", referenceId: prev.id } });
      await tx.order.delete({ where: { id: prev.id } }); // OrderItem en cascada
    }
    const order = await tx.order.create({
      data: {
        organizationId, branchId, warehouseId, customerId: customer.id,
        number: ORDER_NUMBER, status: "DRAFT",
        subtotal: PRICE, total: PRICE,
        deliveryStatus: "PENDING", deliveryAddress: "Domicilio E2E, Chihuahua",
        deliveryLat: LAT, deliveryLng: LNG,
        createdByUserId: userId,
      },
      select: { id: true },
    });
    await tx.orderItem.create({
      data: { organizationId, orderId: order.id, variantId, quantity: 1, unitPrice: PRICE, lineTotal: PRICE },
    });
  });

  console.log(`[seed-e2e] OK — barcode ${BARCODE}, SKU ${SKU}, precio ${PRICE}, pedido ${ORDER_NUMBER}, cliente 'Cliente E2E'.`);
}

main()
  .catch((e) => {
    console.error("[seed-e2e] Error:", e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
