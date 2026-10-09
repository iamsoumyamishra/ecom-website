import { createDatabase } from "@commerce/database";
import { randomUUID } from "node:crypto";
import { emailInput } from "@commerce/contracts";
const email = emailInput.parse({ email: process.argv[2] }).email;
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const db = createDatabase(process.env.DATABASE_URL);
try {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(180045)`;
    if (await tx.user.findFirst({ where: { role: "OWNER" } }))
      throw Error("An owner already exists; use the staff management workflow");
    const old = await tx.user.findUnique({ where: { email } });
    if (old)
      throw Error(
        "Email already exists; do not silently elevate existing accounts",
      );
    const user = await tx.user.create({
      data: {
        id: randomUUID(),
        email,
        name: "Owner",
        role: "OWNER",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "OWNER_BOOTSTRAPPED",
        target: user.id,
        summary: { source: "server-command" },
      },
    });
  });
  console.log(
    "Owner created. Complete email verification on the admin origin.",
  );
} finally {
  await db.$disconnect();
}
