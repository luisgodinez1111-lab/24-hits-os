import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@24hits/database";

// Verifica el mecanismo de revocación de sesión (base de la revocación inmediata,
// ADR-005): una sesión revocada deja de ser válida por su hash de refresh.
// Requiere BD migrada en DATABASE_URL.

const prisma = createPrismaClient();
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const suffix = Date.now().toString(36);

let userId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `sess-${suffix}@example.local`, passwordHash: "x" },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.$disconnect();
});

function findValidByHash(hash: string) {
  return prisma.session.findFirst({
    where: { refreshTokenHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
  });
}

describe("Revocación de sesión", () => {
  it("una sesión activa es válida por su hash; tras revocarla, ya no", async () => {
    const token = randomBytes(32).toString("base64url");
    const hash = sha256(token);
    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash: hash,
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect((await findValidByHash(hash))?.id).toBe(session.id);

    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    expect(await findValidByHash(hash)).toBeNull();
  });
});
