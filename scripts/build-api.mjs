import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { build } = require("esbuild");
await build({
  entryPoints: {
    main: "src/main.ts",
    bootstrap: "src/modules/admin/bootstrap.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  sourcemap: true,
  alias: {
    "@commerce/contracts": path.resolve(
      "../../packages/contracts/src/index.ts",
    ),
    "@commerce/database": path.resolve("../../packages/database/src/index.ts"),
    "@commerce/email": path.resolve("../../packages/email/src/index.tsx"),
  },
});
