import { createPrismaClient, withSystem } from "../src/client.js";

// Reset de datos de VENTAS + CLIENTES (para dejar limpio antes de operar de verdad).
// BORRA: pedidos, cobros, cajas/sesiones, notas de venta y de crédito, clientes y los
// contadores de folio. CONSERVA: usuarios, roles, almacenes, sucursales, organización,
// catálogo (productos/sabores) e inventario (los movimientos de stock NO se tocan).
//
// Seguro por diseño:
//  - Corre en UNA transacción: si algo falla, rollback total (no borra nada a medias).
//  - Exige CONFIRM_RESET=YES (evita ejecuciones accidentales).
//  - Usa withSystem (bypass RLS) para borrar a través de la tenancy, como el seed.
//  - Orden de borrado respeta las llaves foráneas (Payment antes que CashSession por su
//    Restrict; el resto se apoya en onDelete: Cascade).
//
// Uso (contra la BD que apunte DATABASE_URL):
//   CONFIRM_RESET=YES DATABASE_URL="<url>" pnpm --filter @24hits/database db:reset-sales

const prisma = createPrismaClient();

async function main() {
  if (process.env.CONFIRM_RESET !== "YES") {
    console.error(
      "✗ Abortado. Esto BORRA pedidos, cobros, cajas, notas y clientes de la BD de DATABASE_URL.\n" +
        "  Para confirmar, ejecútalo con CONFIRM_RESET=YES."
    );
    process.exit(1);
  }
  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.log(`▶ Reset de ventas + clientes en: ${host || "(host no visible en DATABASE_URL)"}`);

  const before = await withSystem(prisma, async (tx) => {
    const counts = {
      pedidos: await tx.order.count(),
      cobros: await tx.payment.count(),
      sesionesDeCaja: await tx.cashSession.count(),
      notasDeVenta: await tx.saleNote.count(),
      notasDeCredito: await tx.creditNote.count(),
      clientes: await tx.customer.count(),
    };
    // Orden seguro (hijos → padres). Cascades: CashSession→CashMovement,
    // SaleNote→SaleNoteItem, CreditNote→CreditNoteItem, Order→OrderItem.
    await tx.payment.deleteMany({}); // primero: Payment→CashSession es Restrict
    await tx.cashSession.deleteMany({});
    await tx.creditNote.deleteMany({});
    await tx.saleNote.deleteMany({});
    await tx.inventoryReservation.deleteMany({}); // libera holds de los pedidos borrados (no toca el stock)
    await tx.order.deleteMany({});
    await tx.customer.deleteMany({});
    await tx.documentSequence.deleteMany({}); // reinicia folios (clientes vuelven a C-0001, etc.)
    return counts;
  });

  console.log("✓ Listo (transacción confirmada). Borrado:");
  console.table(before);
  console.log("Conservado: usuarios, roles, almacenes, sucursales, catálogo (productos/sabores) e inventario.");
}

main()
  .catch((e) => {
    console.error("✗ Falló — rollback, NO se borró nada:", e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
