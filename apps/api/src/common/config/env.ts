import { z } from "zod";
const blank = (v: unknown) => (v === "" ? undefined : v);
const optional = z.preprocess(blank, z.string().min(1).optional());
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.url().startsWith("postgres"),
    REDIS_URL: z.url().startsWith("redis"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    SHOP_ORIGIN: z.url(),
    ADMIN_ORIGIN: z.url(),
    PROXY_SECRET: z.string().min(32),
    BRAND_NAME: z.string().min(1).default("Forme"),
    SUPPORT_EMAIL: z.email(),
    RESEND_API_KEY: optional,
    EMAIL_FROM: z.string().min(3),
    STRIPE_SECRET_KEY: optional,
    STRIPE_WEBHOOK_SECRET: optional,
    STRIPE_PAYMENT_METHOD_CONFIGURATION: optional,
    SHIPPING_COUNTRIES: z.string().default(""),
    SHIPPING_PRICE_MINOR: z.coerce.number().int().min(0).max(100000).default(0),
    TAX_POLICY: z.preprocess(
      blank,
      z.enum(["included", "not_collecting"]).optional(),
    ),
    TAX_RATES_JSON: z.string().default("{}"),
    STORAGE_ENDPOINT: optional,
    STORAGE_REGION: z.string().default("auto"),
    STORAGE_BUCKET: optional,
    STORAGE_ACCESS_KEY_ID: optional,
    STORAGE_SECRET_ACCESS_KEY: optional,
    STORAGE_CDN_URL: optional,
  })
  .superRefine((v, c) => {
    for (const key of ["SHOP_ORIGIN", "ADMIN_ORIGIN"] as const) {
      const u = new URL(v[key]);
      if (
        u.origin !== v[key] ||
        (v.NODE_ENV === "production" && u.protocol !== "https:")
      )
        c.addIssue({
          code: "custom",
          path: [key],
          message: "Use an exact origin, HTTPS in production",
        });
    }
    for (const key of ["STORAGE_ENDPOINT", "STORAGE_CDN_URL"] as const) {
      if (!v[key]) continue;
      try {
        const url = new URL(v[key]);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          (v.NODE_ENV === "production" && url.protocol !== "https:")
        )
          throw Error();
      } catch {
        c.addIssue({
          code: "custom",
          path: [key],
          message: "Use an HTTP(S) storage URL, HTTPS in production",
        });
      }
    }
    if (v.SHOP_ORIGIN === v.ADMIN_ORIGIN)
      c.addIssue({
        code: "custom",
        message: "Shop and admin must have different origins",
      });
    if (
      v.SHIPPING_COUNTRIES &&
      !v.SHIPPING_COUNTRIES.split(",").every((x) => /^[A-Z]{2}$/.test(x))
    )
      c.addIssue({
        code: "custom",
        path: ["SHIPPING_COUNTRIES"],
        message: "Comma-separated ISO country codes required",
      });
    let rates: Record<string, number> = {};
    try {
      rates = z
        .record(
          z.string().regex(/^[A-Z]{2}$/),
          z.number().int().min(0).max(10000),
        )
        .parse(JSON.parse(v.TAX_RATES_JSON));
    } catch {
      c.addIssue({
        code: "custom",
        path: ["TAX_RATES_JSON"],
        message: "Country to integer basis-point rate map required",
      });
    }
    if (
      v.TAX_POLICY === "included" &&
      v.SHIPPING_COUNTRIES.split(",").some(
        (country) => rates[country] === undefined,
      )
    )
      c.addIssue({
        code: "custom",
        path: ["TAX_RATES_JSON"],
        message:
          "Explicit included tax rates required for every shipping country (including shipping)",
      });
    if (
      v.NODE_ENV === "production" &&
      [v.BETTER_AUTH_SECRET, v.PROXY_SECRET].some(
        (s) => s.startsWith("replace-") || s.startsWith("test-"),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Replace placeholder secrets before production",
      });
    if (
      v.NODE_ENV === "production" &&
      (!v.RESEND_API_KEY ||
        !v.STRIPE_SECRET_KEY ||
        !v.STRIPE_WEBHOOK_SECRET ||
        !v.STRIPE_PAYMENT_METHOD_CONFIGURATION ||
        !v.TAX_POLICY ||
        !v.SHIPPING_COUNTRIES)
    )
      c.addIssue({
        code: "custom",
        message:
          "Production requires email, payment, shipping and tax configuration",
      });
  });
export type Env = z.infer<typeof envSchema>;
export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid configuration: ${result.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ")}`,
    );
  return result.data;
}
