import { describe, it, expect } from "vitest";
import {
  cartItemInput,
  checkoutInput,
  productInput,
  safeReturnPath,
  money,
} from "@commerce/contracts";
import {
  allocateDiscount,
  includedTaxMinor,
} from "../apps/api/src/modules/checkout/checkout.service.js";
import { validPaidSession } from "../apps/api/src/modules/payments/payments.service.js";
import { imageMatches } from "../apps/api/src/modules/media/media.service.js";
import { envSchema } from "../apps/api/src/common/config/env.js";
describe("commerce input boundaries", () => {
  it("rejects client prices, currencies, oversized and fractional quantities", () => {
    for (const payload of [
      { variantId: "v", quantity: 1, priceMinor: 1 },
      { variantId: "v", quantity: 1, currency: "usd" },
      { variantId: "v", quantity: 21 },
      { variantId: "v", quantity: 0 },
      { variantId: "v", quantity: 1.5 },
    ])
      expect(cartItemInput.safeParse(payload).success).toBe(false);
  });
  it("rejects checkout totals and roles", () => {
    const input = {
      idempotencyKey: crypto.randomUUID(),
      shippingAddress: {
        recipient: "Test User",
        line1: "Example street",
        city: "Example",
        postalCode: "12345",
        country: "DE",
      },
    };
    expect(checkoutInput.safeParse(input).success).toBe(true);
    expect(checkoutInput.safeParse({ ...input, totalMinor: 1 }).success).toBe(
      false,
    );
    expect(checkoutInput.safeParse({ ...input, role: "OWNER" }).success).toBe(
      false,
    );
  });
  it("requires integer euro prices and publish data", () => {
    const p = {
      title: "Knit",
      slug: "knit",
      description: "A considered knit.",
      category: "Knitwear",
      fabricCare: "Care with attention",
      imageUrl: "https://cdn.example.com/knit.jpg",
      imageAlt: "Oat knit",
      variants: [
        { sku: "KNIT-M", size: "M", color: "Oat", priceMinor: 4999, onHand: 1 },
      ],
    };
    expect(productInput.safeParse(p).success).toBe(true);
    expect(
      productInput.safeParse({
        ...p,
        imageUrl: "http://127.0.0.1:9000/commerce-images/products/knit.jpg",
      }).success,
    ).toBe(true);
    expect(
      productInput.safeParse({ ...p, imageUrl: "file:///tmp/knit.jpg" })
        .success,
    ).toBe(false);
    expect(
      productInput.safeParse({
        ...p,
        variants: [{ ...p.variants[0], priceMinor: 49.99 }],
      }).success,
    ).toBe(false);
    expect(money(4999)).toContain("49.99");
  });
  it("blocks external and malformed post-login redirects", () => {
    for (const p of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/api/auth/sign-out",
      "/\n/evil.example",
    ])
      expect(safeReturnPath(p)).toBe("/account");
    expect(safeReturnPath("/checkout?x=1")).toBe("/checkout?x=1");
  });
  it("calculates included tax using integer arithmetic and explicitly configured rates", () => {
    expect(includedTaxMinor(12000, 2000)).toBe(2000);
    expect(includedTaxMinor(4999, 0)).toBe(0);
    expect(Number.isInteger(includedTaxMinor(999, 1900))).toBe(true);
  });
  it("allocates every discount cent without exceeding line totals", () => {
    expect(
      allocateDiscount(
        [
          { quantity: 2, priceMinor: 100 },
          { quantity: 3, priceMinor: 50 },
        ],
        251,
      ),
    ).toEqual([200, 51]);
  });
});
describe("payment confirmation boundary", () => {
  const order = { id: "order-1", totalMinor: 4999 };
  const s = {
    status: "complete" as const,
    payment_status: "paid" as const,
    currency: "eur",
    amount_total: 4999,
    metadata: { orderId: "order-1" },
  };
  it("accepts matching completed paid EUR sessions", () =>
    expect(validPaidSession(s, order)).toBe(true));
  it("rejects unpaid completion, wrong amount, currency, owner reference and incomplete status", () => {
    for (const change of [
      { payment_status: "unpaid" as const },
      { amount_total: 4998 },
      { currency: "usd" },
      { metadata: { orderId: "different-order" } },
      { status: "open" as const },
    ])
      expect(validPaidSession({ ...s, ...change }, order)).toBe(false);
  });
});
it("rejects falsely labelled image data", () => {
  expect(imageMatches(Buffer.from("not an image"), "image/jpeg")).toBe(false);
  expect(imageMatches(Buffer.from([255, 216, 255, 0]), "image/jpeg")).toBe(
    true,
  );
});
it("fails configuration validation without secrets and exact separate origins", () => {
  expect(envSchema.safeParse({}).success).toBe(false);
  const e = {
    DATABASE_URL: "postgresql://localhost/db",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
    SHOP_ORIGIN: "http://localhost:3000",
    ADMIN_ORIGIN: "http://localhost:3000",
    PROXY_SECRET: "x".repeat(32),
    SUPPORT_EMAIL: "help@example.com",
    EMAIL_FROM: "Shop <help@example.com>",
  };
  expect(envSchema.safeParse(e).success).toBe(false);
});

it("allows local MinIO HTTP only in development and requires HTTPS storage in production", () => {
  const base = {
    DATABASE_URL: "postgresql://localhost/db",
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "x".repeat(32),
    PROXY_SECRET: "y".repeat(32),
    BETTER_AUTH_URL: "https://shop.example.com",
    SHOP_ORIGIN: "https://shop.example.com",
    ADMIN_ORIGIN: "https://admin.example.com",
    SUPPORT_EMAIL: "help@example.com",
    EMAIL_FROM: "Shop <help@example.com>",
    RESEND_API_KEY: "provider-test",
    STRIPE_SECRET_KEY: "provider-test",
    STRIPE_WEBHOOK_SECRET: "provider-test",
    STRIPE_PAYMENT_METHOD_CONFIGURATION: "pmc_test",
    TAX_POLICY: "not_collecting",
    SHIPPING_COUNTRIES: "DE",
    STORAGE_ENDPOINT: "http://127.0.0.1:9000",
    STORAGE_CDN_URL: "http://127.0.0.1:9000/commerce-images",
  };
  expect(
    envSchema.safeParse({ ...base, NODE_ENV: "development" }).success,
  ).toBe(true);
  expect(envSchema.safeParse({ ...base, NODE_ENV: "production" }).success).toBe(
    false,
  );
  expect(
    envSchema.safeParse({
      ...base,
      NODE_ENV: "production",
      STORAGE_ENDPOINT: "https://storage.example.com",
      STORAGE_CDN_URL: "https://cdn.example.com/commerce-images",
    }).success,
  ).toBe(true);
  expect(
    envSchema.safeParse({ ...base, STORAGE_ENDPOINT: "file:///tmp/storage" })
      .success,
  ).toBe(false);
});
