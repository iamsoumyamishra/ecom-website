// Generate Better Auth models from the installed version's public schema metadata.
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const fromAuth = createRequire(require.resolve("better-auth"));
const { getAuthTables } = await import(
  fromAuth.resolve("@better-auth/core/db")
);
import { writeFileSync } from "node:fs";
const tables = getAuthTables({
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "CUSTOMER", input: false },
      disabled: { type: "boolean", defaultValue: false, input: false },
    },
  },
});
writeFileSync(
  "packages/database/prisma/auth-models.json",
  JSON.stringify(tables, null, 2),
);
let schema =
  "// Generated from Better Auth getAuthTables; do not guess or edit auth fields.\n";
const inverses = new Map();
for (const [name, table] of Object.entries(tables))
  for (const attr of Object.values(table.fields))
    if (attr.references) {
      const target = attr.references.model;
      const list = inverses.get(target) || [];
      list.push(`${name}s ${name[0].toUpperCase() + name.slice(1)}[]`);
      inverses.set(target, list);
    }
for (const [name, table] of Object.entries(tables)) {
  schema += `model ${name[0].toUpperCase() + name.slice(1)} {\n  id String @id\n`;
  for (const [field, a] of Object.entries(table.fields)) {
    const type = {
      string: "String",
      boolean: "Boolean",
      number: "Int",
      date: "DateTime",
    }[a.type];
    if (!type) throw Error(`Unsupported type ${a.type}`);
    let modifiers = a.unique ? " @unique" : "";
    if (a.defaultValue !== undefined && typeof a.defaultValue !== "function")
      modifiers += ` @default(${JSON.stringify(a.defaultValue)})`;
    schema += `  ${field} ${type}${a.required === false ? "?" : ""}${modifiers}\n`;
    if (a.references)
      schema += `  ${a.references.model} ${a.references.model[0].toUpperCase() + a.references.model.slice(1)} @relation(fields:[${field}], references:[${a.references.field}], onDelete:Cascade)\n`;
  }
  for (const line of inverses.get(name) || []) schema += `  ${line}\n`;
  if (name === "user")
    schema +=
      "  addresses Address[]\n  carts Cart[]\n  orders Order[]\n  checkouts CheckoutAttempt[]\n";
  if (name === "session") schema += "  @@index([userId])\n";
  if (name === "account")
    schema += "  @@index([userId])\n  @@unique([providerId, accountId])\n";
  if (name === "verification") schema += "  @@unique([identifier])\n";
  schema += "}\n\n";
}
writeFileSync("packages/database/prisma/auth.generated.prisma", schema);
