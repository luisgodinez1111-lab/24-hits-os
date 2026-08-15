import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPrismaClient,
  withSystem,
  withTenant,
  type ExtendedPrismaClient,
} from "@24hits/database";
import type { PrismaService } from "../src/prisma/prisma.service.js";
import type { AuditService } from "../src/audit/audit.service.js";
import { ProductService } from "../src/catalog/product.service.js";

const prisma: ExtendedPrismaClient = createPrismaClient();
const prismaService = {
  client: prisma,
  withTenant: (org: string, fn: never) => withTenant(prisma, org, fn),
  withSystem: (fn: never) => withSystem(prisma, fn),
} as unknown as PrismaService;
const audit = { record: async () => undefined } as unknown as AuditService;

const products = new ProductService(prismaService, audit);

const suffix = Date.now().toString(36);
let orgId: string;

beforeAll(async () => {
  await withSystem(prisma, async (tx) => {
    const org = await tx.organization.create({ data: { name: "QR", slug: `qr-${suffix}` } });
    orgId = org.id;
  });
});

afterAll(async () => {
  await withSystem(prisma, async (tx) => {
    await tx.priceListItem.deleteMany({ where: { organizationId: orgId } });
    await tx.priceList.deleteMany({ where: { organizationId: orgId } });
    await tx.productBarcode.deleteMany({ where: { organizationId: orgId } });
    await tx.productVariant.deleteMany({ where: { organizationId: orgId } });
    await tx.product.deleteMany({ where: { organizationId: orgId } });
    await tx.flavor.deleteMany({ where: { organizationId: orgId } });
    await tx.brand.deleteMany({ where: { organizationId: orgId } });
    await tx.unitOfMeasure.deleteMany({ where: { organizationId: orgId } });
    await tx.organization.delete({ where: { id: orgId } });
  });
  await prisma.$disconnect();
});

describe("Alta rápida por escaneo (quickRegister)", () => {
  it("da de alta modelo + marca + sabor + código + precio en una operación", async () => {
    const bc = `750100000${suffix}`.slice(0, 32);
    const res = await products.quickRegister(orgId, {
      barcode: bc,
      barcodeType: "EAN",
      brandName: "Hyper Bar",
      productName: "Hyper Bar 9000",
      flavorName: "Sandía",
      price: 180,
      currency: "MXN",
    });

    expect(res.variantId).toBeTruthy();
    expect(res.productId).toBeTruthy();
    expect(res.name).toContain("Hyper Bar 9000");
    expect(res.price).toBe("180");

    // Verifica que todo quedó persistido y enlazado.
    await withTenant(prisma, orgId, async (tx) => {
      const stored = await tx.productBarcode.findFirst({ where: { barcode: bc }, select: { variantId: true, isPrimary: true } });
      expect(stored?.variantId).toBe(res.variantId);
      expect(stored?.isPrimary).toBe(true);
      const brand = await tx.brand.findFirst({ where: { slug: "hyper-bar" } });
      expect(brand).toBeTruthy();
      const flavor = await tx.flavor.findFirst({ where: { normalizedName: "sandia" } });
      expect(flavor).toBeTruthy();
    });
  });

  it("reutiliza el modelo y la marca al dar de alta otro sabor del mismo producto", async () => {
    const bc2 = `750200000${suffix}`.slice(0, 32);
    const res2 = await products.quickRegister(orgId, {
      barcode: bc2,
      barcodeType: "EAN",
      brandName: "Hyper Bar",
      productName: "Hyper Bar 9000",
      flavorName: "Uva",
      currency: "MXN",
    });

    await withTenant(prisma, orgId, async (tx) => {
      const productCount = await tx.product.count({ where: { name: "Hyper Bar 9000" } });
      expect(productCount).toBe(1); // reutilizado, no duplicado
      const brandCount = await tx.brand.count({ where: { slug: "hyper-bar" } });
      expect(brandCount).toBe(1);
      const variant = await tx.productVariant.findFirst({ where: { id: res2.variantId }, select: { productId: true } });
      expect(variant?.productId).toBeTruthy();
    });
  });

  it("rechaza un código de barras ya existente", async () => {
    const bc3 = `750300000${suffix}`.slice(0, 32);
    await products.quickRegister(orgId, { barcode: bc3, barcodeType: "EAN", productName: "Modelo X", currency: "MXN" });
    await expect(
      products.quickRegister(orgId, { barcode: bc3, barcodeType: "EAN", productName: "Modelo Y", currency: "MXN" })
    ).rejects.toMatchObject({ code: "BARCODE_ALREADY_EXISTS" });
  });
});
