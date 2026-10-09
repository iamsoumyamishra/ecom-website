import { z } from "zod";
export const money = (cents: number) =>
  new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const id = z.string().min(1).max(100);
export const variantSchema = z
  .object({
    sku: z.string().min(1).max(80),
    size: z.string().min(1).max(30),
    color: z.string().min(1).max(60),
    priceMinor: z.number().int().min(1).max(10000000),
    onHand: z.number().int().min(0).max(100000),
  })
  .strict();
export const productInput = z
  .object({
    title: z.string().min(2).max(160),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(160),
    description: z.string().min(10).max(10000),
    category: z.string().min(1).max(80),
    fabricCare: z.string().min(1).max(4000),
    imageUrl: z
      .url()
      .refine(
        (value) => ["http:", "https:"].includes(new URL(value).protocol),
        { message: "Use an HTTP(S) image URL" },
      ),
    imageAlt: z.string().min(3).max(250),
    variants: z.array(variantSchema).min(1).max(100),
  })
  .strict();
export const cartItemInput = z
  .object({ variantId: id, quantity: z.number().int().min(1).max(20) })
  .strict();
export const addressInput = z
  .object({
    recipient: z.string().min(2).max(120),
    line1: z.string().min(3).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1).max(100),
    postalCode: z.string().min(1).max(30),
    country: z.string().regex(/^[A-Z]{2}$/),
    phone: z.string().max(40).optional(),
  })
  .strict();
export const checkoutInput = z
  .object({
    idempotencyKey: z.uuid(),
    shippingAddress: addressInput,
    discountCode: z.string().max(60).optional(),
  })
  .strict();
export const stockInput = z
  .object({
    delta: z
      .number()
      .int()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0),
    reason: z.string().min(3).max(200),
  })
  .strict();
export const shipmentInput = z
  .object({
    carrier: z.string().min(1).max(100),
    trackingReference: z.string().min(1).max(200),
  })
  .strict();
export const refundInput = z
  .object({
    amountMinor: z.number().int().positive(),
    reason: z.string().min(3).max(200),
    idempotencyKey: z.uuid(),
  })
  .strict();
export const discountInput = z
  .object({
    code: z.string().regex(/^[A-Z0-9_-]{3,60}$/),
    amountMinor: z.number().int().positive(),
    usageLimit: z.number().int().positive(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, { message: "End must follow start" });
export const emailInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
});
export const safeReturnPath = (
  value: string | null | undefined,
  fallback = "/account",
) =>
  value &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !/[\\\x00-\x1f]/.test(value) &&
  !value.startsWith("/api")
    ? value
    : fallback;
export type ProductInput = z.infer<typeof productInput>;
export type AddressInput = z.infer<typeof addressInput>;
export type CheckoutInput = z.infer<typeof checkoutInput>;
export interface Variant {
  id: string;
  sku: string;
  size: string;
  color: string;
  priceMinor: number;
  currency: "eur";
  available: number;
}
export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  fabricCare: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  images: { id: string; url: string; alt: string }[];
  variants: Variant[];
}
export interface ProductPage {
  items: Product[];
  nextCursor: string | null;
}
export interface Cart {
  id: string;
  items: {
    id: string;
    quantity: number;
    variant: Variant & { product: Product };
  }[];
  subtotalMinor: number;
  currency: "eur";
}
export interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    role: "CUSTOMER" | "STAFF" | "OWNER";
  };
  session: { id: string; createdAt: string; expiresAt: string };
}
export interface Order {
  shippingAddress?: AddressInput;
  email?: string;
  id: string;
  number: string;
  paymentState: string;
  fulfillmentState: string;
  subtotalMinor: number;
  shippingMinor: number;
  taxMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: "eur";
  createdAt: string;
  items: {
    id: string;
    title: string;
    sku: string;
    size: string;
    color: string;
    quantity: number;
    unitPriceMinor: number;
  }[];
  shipments: { carrier: string; trackingReference: string }[];
  payments?: {
    id: string;
    amountMinor: number;
    refunds: { amountMinor: number; status: string }[];
  }[];
}
export const productUpdateInput = productInput
  .omit({ imageUrl: true, imageAlt: true, variants: true })
  .extend({
    variants: z
      .array(variantSchema.omit({ onHand: true }).extend({ id }))
      .min(1)
      .max(100),
  })
  .strict();

export const cartQuantityInput = cartItemInput
  .pick({ quantity: true })
  .strict();
