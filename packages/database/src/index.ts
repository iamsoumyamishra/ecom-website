import { PrismaClient } from "../generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
export { Prisma, PrismaClient } from "../generated/client/client.js";
export function createDatabase(url: string) {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: url, max: 10, connectionTimeoutMillis: 5000 },
      { schema: new URL(url).searchParams.get("schema") ?? "public" },
    ),
  });
}
