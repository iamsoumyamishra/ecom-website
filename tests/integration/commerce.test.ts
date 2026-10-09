import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { Runtime } from "../../apps/api/src/common/runtime.js";
import { CheckoutService } from "../../apps/api/src/modules/checkout/checkout.service.js";
import { PaymentsService } from "../../apps/api/src/modules/payments/payments.service.js";
import { OrdersService } from "../../apps/api/src/modules/orders/orders.service.js";
import { CatalogService } from "../../apps/api/src/modules/catalog/catalog.service.js";
import { randomUUID, createHash } from "node:crypto";
import { CartsService } from "../../apps/api/src/modules/carts/carts.service.js";
import type Stripe from "../../apps/api/node_modules/stripe/esm/stripe.esm.node.js";
const require = createRequire(
  new URL("../../packages/database/package.json", import.meta.url),
);
const { Pool } =
  require("pg") as typeof import("../../packages/database/node_modules/@types/pg/index.js");
const rawUrl = process.env.TEST_DATABASE_URL;
if (!rawUrl)
  throw Error(
    "TEST_DATABASE_URL is required; use a dedicated database ending in _test",
  );
const parsed = new URL(rawUrl);
if (!parsed.pathname.endsWith("_test"))
  throw Error("Integration database name must end in _test");
const schema = `commerce_test_${randomUUID().replaceAll("-", "")}`;
parsed.searchParams.set("schema", schema);
let r: Runtime;
let checkout: CheckoutService;
let payments: PaymentsService;
let orders: OrdersService;
let lastSession: Stripe.Checkout.Session;
let user: { id: string; email: string };
let variantId: string;
let serial = 0;
let failCreation = false;
let pool: InstanceType<typeof Pool>;
let schemaCreated = false;
const providerSessions = new Map<string, Stripe.Checkout.Session>();
beforeAll(async () => {
  pool = new Pool({ connectionString: rawUrl });
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(
      readFileSync(
        "packages/database/prisma/migrations/202610090001_initial/migration.sql",
        "utf8",
      ).replace('CREATE SCHEMA IF NOT EXISTS "public";', ""),
    );
  } finally {
    client.release();
  }
  const config = {
    NODE_ENV: "test",
    DATABASE_URL: parsed.toString(),
    REDIS_URL: "redis://localhost:6379",
    BETTER_AUTH_SECRET: "test-secret-abcdefghijklmnopqrstuvwxyz",
    BETTER_AUTH_URL: "http://localhost:3000",
    SHOP_ORIGIN: "http://localhost:3000",
    ADMIN_ORIGIN: "http://localhost:3001",
    PROXY_SECRET: "test-proxy-abcdefghijklmnopqrstuvwxyz",
    SUPPORT_EMAIL: "test@example.com",
    EMAIL_FROM: "Test <test@example.com>",
    STRIPE_SECRET_KEY: "sk_test_no_outbound_calls",
    STRIPE_WEBHOOK_SECRET: "whsec_test_only",
    STRIPE_PAYMENT_METHOD_CONFIGURATION: "pmc_test_cards_only",
    SHIPPING_COUNTRIES: "DE",
    SHIPPING_PRICE_MINOR: "500",
    TAX_POLICY: "not_collecting",
  };
  Object.entries(config).forEach(([k, v]) => vi.stubEnv(k, v));
  r = new Runtime();
  checkout = new CheckoutService(r);
  payments = new PaymentsService(r, checkout);
  orders = new OrdersService(r);
  vi.spyOn(r.stripe!.checkout.sessions, "create").mockImplementation(
    async (params, options) => {
      const key = options?.idempotencyKey ?? String(serial);
      const cached = providerSessions.get(key);
      if (cached) return cached as never;
      serial++;
      if (failCreation)
        throw new r.stripe!.errors.StripeConnectionError({
          message: "Ambiguous transport failure",
        });
      lastSession = {
        id: `cs_test_${serial}`,
        url: "https://checkout.stripe.com/test",
        payment_method_types: ["card"],
        status: "open",
        payment_status: "unpaid",
        currency: "eur",
        amount_total: 1499,
        metadata: params?.metadata ?? {},
        payment_intent: `pi_test_${serial}`,
        customer_details: null,
      } as Stripe.Checkout.Session;
      providerSessions.set(key, lastSession);
      return lastSession as never;
    },
  );
  vi.spyOn(r.stripe!.checkout.sessions, "retrieve").mockImplementation(
    async () => lastSession as never,
  );
  vi.spyOn(r.stripe!.paymentIntents, "retrieve").mockImplementation(
    async (id) =>
      ({
        id,
        status: "succeeded",
        currency: "eur",
        amount_received: lastSession.amount_total,
        metadata: lastSession.metadata,
      }) as never,
  );
});
beforeEach(async () => {
  failCreation = false;
  const n = randomUUID();
  user = await r.db.user.create({
    data: {
      id: n,
      email: `${n}@example.com`,
      name: "Fixture",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const product = await r.db.product.create({
    data: {
      slug: `product-${n}`,
      title: "Fixture knit",
      description: "An integration fixture",
      category: "Knitwear",
      fabricCare: "Fixture care",
      status: "PUBLISHED",
      variants: {
        create: {
          sku: `sku-${n}`,
          size: "M",
          color: "Oat",
          priceMinor: 999,
          inventory: { create: { onHand: 1 } },
        },
      },
    },
    include: { variants: true },
  });
  variantId = product.variants[0].id;
  await r.db.cart.create({
    data: { userId: user.id, items: { create: { variantId, quantity: 1 } } },
  });
});
afterAll(async () => {
  await r?.db.$disconnect();
  r?.redis.disconnect();
  if (pool) {
    if (schemaCreated)
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const input = () => ({
  idempotencyKey: randomUUID(),
  shippingAddress: {
    recipient: "Fixture Customer",
    line1: "Fixture street 1",
    city: "Berlin",
    postalCode: "10115",
    country: "DE",
  },
});
async function pay() {
  lastSession = { ...lastSession, status: "complete", payment_status: "paid" };
  await payments.reconcile(lastSession);
}
describe("PostgreSQL commerce transactions", () => {
  it("reserves the last unit for only one of two customers", async () => {
    const other = await r.db.user.create({
      data: {
        id: randomUUID(),
        email: `${randomUUID()}@example.com`,
        name: "Other",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await r.db.cart.create({
      data: { userId: other.id, items: { create: { variantId, quantity: 1 } } },
    });
    const results = await Promise.allSettled([
      checkout.create(user, input()),
      checkout.create(other, input()),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      (await r.db.inventory.findUniqueOrThrow({ where: { variantId } }))
        .reserved,
    ).toBe(1);
  });
  it("deduplicates simultaneous checkout calls using the same key", async () => {
    const data = input();
    const results = await Promise.all([
      checkout.create(user, data),
      checkout.create(user, data),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(await r.db.order.count({ where: { userId: user.id } })).toBe(1);
  });
  it("keeps reservations after ambiguous Stripe failure and recovers with the same key", async () => {
    const data = input();
    failCreation = true;
    await expect(checkout.create(user, data)).rejects.toThrow("uncertain");
    expect(
      (await r.db.inventory.findUniqueOrThrow({ where: { variantId } }))
        .reserved,
    ).toBe(1);
    failCreation = false;
    await checkout.create(user, data);
    expect(await r.db.order.count({ where: { userId: user.id } })).toBe(1);
  });
  it("rejects client totals and currency before reserving", async () => {
    await expect(
      checkout.create(user, { ...input(), totalMinor: 1 }),
    ).rejects.toThrow();
    await expect(
      checkout.create(user, { ...input(), currency: "usd" }),
    ).rejects.toThrow();
    expect(
      (await r.db.inventory.findUniqueOrThrow({ where: { variantId } }))
        .reserved,
    ).toBe(0);
  });
  it("does not confirm unpaid completion; confirmed payment sells stock once despite duplicates", async () => {
    await checkout.create(user, input());
    lastSession.status = "complete";
    await payments.reconcile(lastSession);
    let order = await r.db.order.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(order.paymentState).toBe("PENDING");
    await pay();
    await payments.reconcile(lastSession);
    order = await r.db.order.findFirstOrThrow({ where: { userId: user.id } });
    expect(order.paymentState).toBe("PAID");
    expect(await r.db.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      (await r.db.inventory.findUniqueOrThrow({ where: { variantId } })).onHand,
    ).toBe(0);
    expect(
      await r.db.outboxEvent.count({
        where: { key: `confirmation-${order.id}` },
      }),
    ).toBe(1);
  });
  it("stores webhook receipt, retries after a crash and rejects invalid signatures", async () => {
    await checkout.create(user, input());
    lastSession.status = "complete";
    lastSession.payment_status = "paid";
    const payload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      data: { object: { id: lastSession.id } },
    });
    await expect(
      payments.receive(Buffer.from(payload), "invalid"),
    ).rejects.toThrow("signature");
    const signature = r.stripe!.webhooks.generateTestHeaderString({
      payload,
      secret: r.env.STRIPE_WEBHOOK_SECRET!,
    });
    await payments.receive(Buffer.from(payload), signature);
    await payments.receive(Buffer.from(payload), signature);
    const eventId = JSON.parse(payload).id;
    await payments.processReceipt(eventId);
    await payments.processReceipt(eventId);
    expect(
      (await r.db.webhookEvent.findUniqueOrThrow({ where: { id: eventId } }))
        .state,
    ).toBe("PROCESSED");
  });
  it("reconciles a missed payment without depending on email delivery", async () => {
    await checkout.create(user, input());
    await pay();
    const order = await r.db.order.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(order.paymentState).toBe("PAID");
    expect(
      (
        await r.db.outboxEvent.findUniqueOrThrow({
          where: { key: `confirmation-${order.id}` },
        })
      ).state,
    ).toBe("PENDING");
  });
  it("retains historical price and address snapshots after catalog changes", async () => {
    await checkout.create(user, input());
    await r.db.productVariant.update({
      where: { id: variantId },
      data: { priceMinor: 9999 },
    });
    const o = await r.db.order.findFirstOrThrow({
      where: { userId: user.id },
      include: { items: true },
    });
    expect(o.items[0].unitPriceMinor).toBe(999);
    expect(o.totalMinor).toBe(1499);
    expect((o.shippingAddress as { city: string }).city).toBe("Berlin");
  });
  it("never ships a pending order or removes reserved inventory", async () => {
    const result = await checkout.create(user, input());
    const order = await r.db.order.findUniqueOrThrow({
      where: { checkoutId: result.id },
    });
    await expect(
      orders.ship(
        order.id,
        { carrier: "Test", trackingReference: "123" },
        user.id,
      ),
    ).rejects.toThrow("paid");
    const catalog = new CatalogService(r);
    await expect(
      catalog.adjust(
        variantId,
        { delta: -1, reason: "Unsafe adjustment" },
        user.id,
      ),
    ).rejects.toThrow("reserved");
  });
  it("puts a payment racing terminal release into manual review with a payment ledger", async () => {
    const attempt = await checkout.create(user, input());
    await checkout.release(attempt.id, "EXPIRED");
    await pay();
    const o = await r.db.order.findUniqueOrThrow({
      where: { checkoutId: attempt.id },
    });
    expect(o.paymentState).toBe("REVIEW");
    expect(o.fulfillmentState).toBe("HOLD");
    expect(await r.db.payment.count({ where: { orderId: o.id } })).toBe(1);
  });
  it("reconciles partial refunds idempotently without restocking and rejects over-refunds", async () => {
    const attempt = await checkout.create(user, input());
    await pay();
    const order = await r.db.order.findUniqueOrThrow({
      where: { checkoutId: attempt.id },
    });
    let refundSerial = 0;
    const remote = new Map<
      string,
      {
        id: string;
        payment_intent: string;
        currency: string;
        amount: number;
        status: string;
        metadata: { localRefundId: string };
      }
    >();
    const create = vi
      .spyOn(r.stripe!.refunds, "create")
      .mockImplementation(async (params) => {
        const result = {
          id: `re_test_${++refundSerial}`,
          payment_intent: String(params!.payment_intent),
          currency: "eur",
          amount: params!.amount!,
          status: "succeeded",
          metadata: {
            localRefundId: String(
              (params!.metadata as { localRefundId: string }).localRefundId,
            ),
          },
        };
        remote.set(result.id, result);
        return result as never;
      });
    const retrieve = vi
      .spyOn(r.stripe!.refunds, "retrieve")
      .mockImplementation(async (id) => remote.get(id) as never);
    const data = {
      amountMinor: 500,
      reason: "Partial return",
      idempotencyKey: randomUUID(),
    };
    const local = await orders.refund(order.id, data, user.id);
    expect(local.status).toBe("REQUESTED");
    await orders.refund(order.id, data, user.id);
    expect(create).toHaveBeenCalledTimes(1);
    await payments.reconcileRefund(local.providerRefundId!);
    await payments.reconcileRefund(local.providerRefundId!);
    expect(
      (await r.db.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentState,
    ).toBe("PARTIALLY_REFUNDED");
    expect(
      (await r.db.inventory.findUniqueOrThrow({ where: { variantId } })).onHand,
    ).toBe(0);
    await expect(
      orders.refund(
        order.id,
        { ...data, amountMinor: 1000, idempotencyKey: randomUUID() },
        user.id,
      ),
    ).rejects.toThrow("remaining");
    create.mockRestore();
    retrieve.mockRestore();
  });
  it("updates only owned bag items within stock and freezes an active checkout", async () => {
    const carts = new CartsService(r, {} as never);
    const cart = await r.db.cart.findUniqueOrThrow({
      where: { userId: user.id },
      include: { items: true },
    });
    await expect(
      carts.update("another-cart", cart.items[0].id, { quantity: 1 }),
    ).rejects.toThrow("not found");
    await expect(
      carts.update(cart.id, cart.items[0].id, { quantity: 2 }),
    ).rejects.toThrow("unavailable");
    await r.db.inventory.update({ where: { variantId }, data: { onHand: 2 } });
    expect(
      (await carts.update(cart.id, cart.items[0].id, { quantity: 2 }))
        .subtotalMinor,
    ).toBe(1998);
    await checkout.create(user, input());
    await expect(
      carts.update(cart.id, cart.items[0].id, { quantity: 1 }),
    ).rejects.toThrow("active checkout");
  });
  it("merges a guest bag once and clamps combined quantity to availability", async () => {
    const token = "a".repeat(64);
    const guest = await r.db.cart.create({
      data: {
        guestId: createHash("sha256").update(token).digest("hex"),
        items: { create: { variantId, quantity: 1 } },
      },
    });
    const carts = new CartsService(r, {
      require: async () => ({ user }),
    } as never);
    const req = {
      headers: { cookie: `commerce-guest=${token}` },
    } as Parameters<CartsService["merge"]>[0];
    const res = { clearCookie: vi.fn() } as unknown as Parameters<
      CartsService["merge"]
    >[1];
    const merged = await carts.merge(req, res);
    expect(merged.items[0].quantity).toBe(1);
    expect(merged.subtotalMinor).toBe(999);
    expect(await r.db.cartItem.count({ where: { cartId: guest.id } })).toBe(0);
    expect((await carts.merge(req, res)).items[0].quantity).toBe(1);
  });
  it("rejects another customer’s order", async () => {
    const result = await checkout.create(user, input());
    const o = await r.db.order.findUniqueOrThrow({
      where: { checkoutId: result.id },
    });
    await expect(orders.get("another-user", o.id)).rejects.toThrow("not found");
  });
});
