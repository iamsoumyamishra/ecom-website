import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { checkoutInput, type CheckoutInput } from "@commerce/contracts";
import type { Prisma } from "@commerce/database";
import { createHash, randomUUID } from "node:crypto";
import { Runtime } from "../../common/runtime.js";
import { lockCart, assertCartIdle } from "../carts/carts.service.js";
export const attemptInclude = {
  order: { include: { items: true, redemptions: true } },
  reservations: true,
};
export type Attempt = Prisma.CheckoutAttemptGetPayload<{
  include: typeof attemptInclude;
}>;
export function includedTaxMinor(grossMinor: number, rateBasisPoints: number) {
  const divisor = BigInt(10000 + rateBasisPoints);
  return Number(
    (BigInt(grossMinor) * BigInt(rateBasisPoints) + divisor / 2n) / divisor,
  );
}
export function allocateDiscount(
  items: { quantity: number; priceMinor: number }[],
  amount: number,
) {
  let remaining = amount;
  return items.map((i) => {
    const allocated = Math.min(remaining, i.quantity * i.priceMinor);
    remaining -= allocated;
    return allocated;
  });
}
@Injectable()
export class CheckoutService {
  constructor(@Inject(Runtime) readonly r: Runtime) {}
  async create(user: { id: string; email: string }, input: unknown) {
    const data = checkoutInput.parse(input);
    this.requireConfiguration(data);
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    const attempt = await this.r.db.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId: user.id } });
      if (!cart) throw new BadRequestException("Your bag is empty");
      await lockCart(tx, cart.id);
      const previous = await tx.checkoutAttempt.findUnique({
        where: {
          userId_idempotencyKey: {
            userId: user.id,
            idempotencyKey: data.idempotencyKey,
          },
        },
        include: attemptInclude,
      });
      if (previous) {
        if (previous.requestHash !== hash)
          throw new ConflictException(
            "This idempotency key belongs to another request",
          );
        return previous;
      }
      await assertCartIdle(tx, cart.id);
      const items = await tx.cartItem.findMany({
        where: { cartId: cart.id },
        include: { variant: { include: { product: true } } },
        orderBy: { variantId: "asc" },
      });
      if (!items.length) throw new BadRequestException("Your bag is empty");
      if (items.reduce((n, i) => n + i.quantity, 0) > 90)
        throw new BadRequestException("Checkout is limited to 90 units");
      let subtotal = 0;
      for (const i of items) {
        const v = i.variant;
        if (v.product.status !== "PUBLISHED" || v.currency !== "eur")
          throw new BadRequestException("A product is unavailable");
        const n =
          await tx.$executeRaw`UPDATE "Inventory" SET "reserved"="reserved"+${i.quantity},"updatedAt"=NOW() WHERE "variantId"=${v.id} AND "onHand"-"reserved">=${i.quantity}`;
        if (n !== 1)
          throw new ConflictException("A selected size has insufficient stock");
        subtotal += i.quantity * v.priceMinor;
      }
      let discount: null | { id: string; amountMinor: number } = null;
      if (data.discountCode) {
        const d = await tx.discount.findUnique({
          where: { code: data.discountCode.toUpperCase() },
        });
        if (!d) throw new BadRequestException("Discount is unavailable");
        const n =
          await tx.$executeRaw`UPDATE "Discount" SET "allocated"="allocated"+1 WHERE id=${d.id} AND active=true AND "startsAt"<=NOW() AND "endsAt">NOW() AND allocated+redeemed<"usageLimit"`;
        if (n !== 1) throw new BadRequestException("Discount is unavailable");
        discount = { id: d.id, amountMinor: Math.min(d.amountMinor, subtotal) };
      }
      const shipping = this.r.env.SHIPPING_PRICE_MINOR;
      const total = subtotal + shipping - (discount?.amountMinor ?? 0);
      if (total < 50)
        throw new BadRequestException(
          "Checkout total must be at least EUR 0.50",
        );
      const discounts = allocateDiscount(
        items.map((i) => ({
          quantity: i.quantity,
          priceMinor: i.variant.priceMinor,
        })),
        discount?.amountMinor ?? 0,
      );
      const rate =
        this.r.env.TAX_POLICY === "included"
          ? (JSON.parse(this.r.env.TAX_RATES_JSON) as Record<string, number>)[
              data.shippingAddress.country
            ]!
          : 0;
      const lineTaxes = items.map((i, index) =>
        includedTaxMinor(
          i.quantity * i.variant.priceMinor - discounts[index],
          rate,
        ),
      );
      const taxMinor =
        lineTaxes.reduce((n, t) => n + t, 0) + includedTaxMinor(shipping, rate);
      return tx.checkoutAttempt.create({
        data: {
          userId: user.id,
          cartId: cart.id,
          idempotencyKey: data.idempotencyKey,
          requestHash: hash,
          expiresAt: new Date(Date.now() + 35 * 60 * 1000),
          reservations: {
            create: items.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
            })),
          },
          order: {
            create: {
              number: `F-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
              userId: user.id,
              email: user.email,
              shippingAddress: data.shippingAddress,
              subtotalMinor: subtotal,
              shippingMinor: shipping,
              taxMinor,
              discountMinor: discount?.amountMinor ?? 0,
              totalMinor: total,
              items: {
                create: items.map((i, index) => ({
                  variantId: i.variantId,
                  sku: i.variant.sku,
                  title: i.variant.product.title,
                  size: i.variant.size,
                  color: i.variant.color,
                  quantity: i.quantity,
                  unitPriceMinor: i.variant.priceMinor,
                  discountMinor: discounts[index],
                  taxMinor: lineTaxes[index],
                })),
              },
              ...(discount
                ? {
                    redemptions: {
                      create: {
                        discountId: discount.id,
                        amountMinor: discount.amountMinor,
                      },
                    },
                  }
                : {}),
            },
          },
        },
        include: attemptInclude,
      });
    });
    return this.open(attempt);
  }
  private requireConfiguration(data: CheckoutInput) {
    const e = this.r.env;
    if (
      !this.r.stripe ||
      !e.STRIPE_PAYMENT_METHOD_CONFIGURATION ||
      !e.TAX_POLICY ||
      !e.SHIPPING_COUNTRIES
    )
      throw new ServiceUnavailableException(
        "Checkout requires payment, shipping and tax configuration",
      );
    if (!e.SHIPPING_COUNTRIES.split(",").includes(data.shippingAddress.country))
      throw new BadRequestException("We do not ship to this country");
  }
  async open(attempt: Attempt) {
    if (["FAILED", "EXPIRED", "REVIEW"].includes(attempt.state))
      throw new ConflictException("This checkout is no longer available");
    if (attempt.providerSessionId || attempt.state === "PAID")
      return { id: attempt.id, url: attempt.providerUrl, state: attempt.state };
    if (!this.r.stripe)
      throw new ServiceUnavailableException("Payments are not configured");
    if (Date.now() - attempt.createdAt.getTime() > 23 * 60 * 60 * 1000) {
      await this.r.db.checkoutAttempt.update({
        where: { id: attempt.id },
        data: { state: "REVIEW" },
      });
      throw new ConflictException("Checkout needs staff review");
    }
    const order = attempt.order!;
    const line_items = order.items.flatMap((i) => {
      const base = Math.floor(i.discountMinor / i.quantity);
      const extra = i.discountMinor % i.quantity;
      return Array.from({ length: i.quantity }, (_, n) => ({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: i.unitPriceMinor - base - (n < extra ? 1 : 0),
          product_data: { name: `${i.title} / ${i.size} / ${i.color}` },
        },
      }));
    });
    if (order.shippingMinor)
      line_items.push({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: order.shippingMinor,
          product_data: { name: "Delivery" },
        },
      });
    try {
      const session = await this.r.stripe.checkout.sessions.create(
        {
          integration_identifier: `clothing-${Array.from(
            createHash("sha256").update(attempt.id).digest().subarray(0, 8),
          )
            .map((x) => String.fromCharCode(97 + (x % 26)))
            .join("")}`,
          mode: "payment",
          customer_email: order.email,
          line_items,
          payment_method_configuration:
            this.r.env.STRIPE_PAYMENT_METHOD_CONFIGURATION,
          adaptive_pricing: { enabled: false },
          billing_address_collection: "required",
          expires_at: Math.floor(attempt.expiresAt.getTime() / 1000),
          success_url: `${this.r.env.SHOP_ORIGIN}/checkout/return?attempt=${attempt.id}`,
          cancel_url: `${this.r.env.SHOP_ORIGIN}/checkout/return?attempt=${attempt.id}`,
          metadata: { attemptId: attempt.id, orderId: order.id },
          payment_intent_data: {
            metadata: { orderId: order.id, attemptId: attempt.id },
          },
        },
        { idempotencyKey: `checkout-${attempt.id}` },
      );
      if (
        session.payment_method_types?.length !== 1 ||
        session.payment_method_types[0] !== "card"
      ) {
        await this.r.db.checkoutAttempt.updateMany({
          where: { id: attempt.id, state: "CREATING" },
          data: { providerSessionId: session.id, state: "OPEN" },
        });
        await this.r.stripe.checkout.sessions
          .expire(session.id)
          .catch(() => undefined);
        throw new ServiceUnavailableException(
          "Use a card-only payment method configuration",
        );
      }
      await this.r.db.checkoutAttempt.updateMany({
        where: { id: attempt.id, state: "CREATING" },
        data: {
          providerSessionId: session.id,
          providerUrl: session.url,
          state: "OPEN",
        },
      });
      return { id: attempt.id, url: session.url, state: "OPEN" };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        error.type === "StripeInvalidRequestError"
      ) {
        await this.release(attempt.id, "FAILED");
        throw new BadRequestException(
          "Payment session could not be created. Check payment configuration.",
        );
      }
      throw new ServiceUnavailableException(
        "Payment provider response is uncertain. Retry this same checkout; your stock remains reserved.",
      );
    }
  }
  async release(id: string, state: "FAILED" | "EXPIRED") {
    await this.r.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CheckoutAttempt" WHERE id=${id} FOR UPDATE`;
      const a = await tx.checkoutAttempt.findUnique({
        where: { id },
        include: attemptInclude,
      });
      if (!a || !["CREATING", "OPEN"].includes(a.state)) return;
      for (const r of [...a.reservations].sort((a, b) =>
        a.variantId.localeCompare(b.variantId),
      )) {
        if (r.state !== "HELD") continue;
        await tx.inventory.update({
          where: { variantId: r.variantId },
          data: { reserved: { decrement: r.quantity } },
        });
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { state: "RELEASED" },
        });
      }
      for (const d of a.order?.redemptions ?? []) {
        if (d.state !== "HELD") continue;
        await tx.discount.update({
          where: { id: d.discountId },
          data: { allocated: { decrement: 1 } },
        });
        await tx.discountRedemption.update({
          where: { id: d.id },
          data: { state: "RELEASED" },
        });
      }
      await tx.checkoutAttempt.update({ where: { id }, data: { state } });
      await tx.order.update({
        where: { checkoutId: id },
        data: { paymentState: state === "EXPIRED" ? "CANCELED" : "FAILED" },
      });
    });
  }
  async active(userId: string) {
    return this.r.db.checkoutAttempt.findFirst({
      where: { userId, state: { in: ["CREATING", "OPEN"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, state: true, providerUrl: true },
    });
  }
  async status(userId: string, id: string) {
    const a = await this.r.db.checkoutAttempt.findFirst({
      where: { id, userId },
      include: { order: { include: { items: true, shipments: true } } },
    });
    if (!a) throw new NotFoundException("Checkout not found");
    return { state: a.state, order: a.order };
  }
}
