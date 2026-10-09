import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it, expect } from "vitest";
it("renders login and order templates under the API development loader", (context) => {
  const script = `
    const {loginEmail,orderEmail}=await import('@commerce/email');
    const login=await loginEmail('Fixture','000000','support@example.com');
    const order=await orderEmail('Fixture','TEST','shipment','support@example.com');
    if(!login.html || !login.text || !order.html || !order.text) throw Error('Empty email');
    console.log('Templates rendered');
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: fileURLToPath(new URL("../apps/api/", import.meta.url)),
      stdio: "inherit",
      timeout: 10000,
    },
  );
  if (result.error && "code" in result.error && result.error.code === "EPERM")
    context.skip(
      "Environment prohibits child-process execution; run the loader check directly",
    );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
});
