import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@commerce/database";
export async function bootstrapOwner(
  db: PrismaClient,
  email: string,
  promoteVerifiedCustomer = false,
) {
  return db.$transaction(async (tx) => {
    // The lock returns PostgreSQL void; execute it without deserializing records.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(180045)`;
    if (await tx.user.findFirst({ where: { role: "OWNER" } }))
      throw Error("An owner already exists; use the staff management workflow");
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing && !promoteVerifiedCustomer)
      throw Error(
        "Email already exists. To explicitly bootstrap a verified customer as the first owner, rerun with --promote-verified-customer",
      );
    if (
      existing &&
      (existing.role !== "CUSTOMER" ||
        existing.disabled ||
        !existing.emailVerified)
    )
      throw Error(
        "Only an active, verified customer can be explicitly promoted by this bootstrap command",
      );
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { role: "OWNER" },
        })
      : await tx.user.create({
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
    if (existing) await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "OWNER_BOOTSTRAPPED",
        target: user.id,
        summary: {
          source: "server-command",
          promotedExistingCustomer: !!existing,
        },
      },
    });
    return user.id;
  });
}
