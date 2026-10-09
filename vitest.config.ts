import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@commerce/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url),
      ),
      "better-auth/adapters/prisma": fileURLToPath(
        new URL("./tests/support/test-prisma-adapter.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "tests/e2e/**"],
    environment: "node",
    testTimeout: 20000,
  },
});
