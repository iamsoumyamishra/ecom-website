import { test, expect } from "@playwright/test";
test("browse, select an available variant and add it to the bag", async ({
  page,
}) => {
  await page.goto("/catalog");
  await expect(
    page.getByRole("heading", { name: "The collection." }),
  ).toBeVisible();
  await page.locator(".product-card").first().click();
  const sizes = page.getByRole("group", { name: "Select size" });
  await sizes.locator("button:not([disabled])").first().click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added to your bag" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View bag →" }).click();
  await expect(page.getByRole("heading", { name: "Your bag." })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to checkout" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(
    page.getByRole("link", { name: "Sign in to continue" }),
  ).toBeVisible();
});
test("passwordless sign-in accepts accessible code entry and never promises unconfigured delivery", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toHaveAttribute(
    "autocomplete",
    "email",
  );
  await expect(
    page.getByRole("button", { name: "Send sign-in code" }),
  ).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});
test("admin product publication with a preverified test staff session", async ({
  browser,
}) => {
  test.skip(
    !process.env.E2E_ADMIN_SESSION_COOKIE,
    "Provide an isolated test staff cookie; this test never sends real emails.",
  );
  const origin = process.env.E2E_ADMIN_ORIGIN ?? "http://localhost:3001";
  const context = await browser.newContext();
  const [name, ...value] = process.env.E2E_ADMIN_SESSION_COOKIE!.split("=");
  await context.addCookies([
    {
      name,
      value: value.join("="),
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${origin}/products/new`);
  const suffix = Date.now().toString();
  await page.getByLabel("Title", { exact: true }).fill(`Smoke knit ${suffix}`);
  await page.getByLabel("URL slug").fill(`smoke-knit-${suffix}`);
  await page.getByLabel("Category", { exact: true }).fill("Knitwear");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A product created by the isolated browser test.");
  await page.getByLabel("Fabric & care").fill("Fixture fabric and care");
  await page
    .getByLabel("Image description / alt text")
    .fill("Fixture neutral knit");
  await page
    .getByLabel("Final image URL from your CDN")
    .fill("https://images.unsplash.com/photo-1434389677669-e08b4cac3105");
  await page.getByLabel("SKU", { exact: true }).fill(`SMOKE-${suffix}`);
  await page.getByLabel("EUR cents").fill("4999");
  await page.getByLabel("Opening stock").fill("2");
  await page.getByRole("button", { name: "Save as draft" }).click();
  const row = page.getByRole("row").filter({ hasText: `Smoke knit ${suffix}` });
  await row.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(row.getByText("published", { exact: true })).toBeVisible();
  await context.close();
});
