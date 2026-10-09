import { createDatabase } from "@commerce/database";
import { emailInput } from "@commerce/contracts";
import { bootstrapOwner } from "./bootstrap-owner.js";
const args = process.argv.slice(2);
if (
  args.length > 2 ||
  args.slice(1).some((arg) => arg !== "--promote-verified-customer")
)
  throw Error(
    "Usage: pnpm admin:bootstrap <email> [--promote-verified-customer]",
  );
const email = emailInput.parse({ email: args[0] }).email;
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const db = createDatabase(process.env.DATABASE_URL);
try {
  await bootstrapOwner(db, email, args.includes("--promote-verified-customer"));
  console.log(
    "Owner bootstrapped. Complete email verification on the admin origin.",
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Owner bootstrap failed",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
