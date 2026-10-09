// Test-only substitute for persistence. The production configuration is unchanged.
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const fromAuth = createRequire(require.resolve("better-auth"));
const { memoryAdapter } = fromAuth("better-auth/adapters/memory") as {
  memoryAdapter: (db: Record<string, Record<string, unknown>[]>) => unknown;
};
export const memory = {
  user: [] as Record<string, unknown>[],
  session: [] as Record<string, unknown>[],
  account: [] as Record<string, unknown>[],
  verification: [] as Record<string, unknown>[],
};
export const prismaAdapter = () => memoryAdapter(memory);
