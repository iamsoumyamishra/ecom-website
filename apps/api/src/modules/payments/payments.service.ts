import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type Stripe from "stripe";
import type { Prisma } from "@commerce/database";
import { Runtime } from "../../common/runtime.js";
import {
  CheckoutService,
  attemptInclude,
} from "../checkout/checkout.service.js";
export function validPaidSession(
  s: Pick<
    Stripe.Checkout.Session,
    "status" | "payment_status" | "currency" | "amount_total" | "metadata"
  >,
  order: { id: string; totalMinor: number },
) {
  return (
    s.status === "complete" &&
    s.payment_status === "paid" &&
    s.currency === "eur" &&
    s.amount_total === order.totalMinor &&
    s.metadata?.orderId === order.id
  );
}
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(Runtime) readonly r: Runtime,
    @Inject(CheckoutService) readonly checkout: CheckoutService,
  ) {}
  async receive(body: Buffer, signature: string) {
    if (!this.r.stripe || !this.r.env.STRIPE_WEBHOOK_SECRET)
      throw new ServiceUnavailableException("Webhook is not configured");
    let event: Stripe.Event;
    try {
      event = this.r.stripe.webhooks.constructEvent(
        body,
        signature,
        this.r.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new BadRequestException("Invalid webhook signature");
    }
    // Store only provider objects needed for reconciliation; avoid card and customer details in the receipt.
    const object = event.data.object as unknown as { id: string };
    await this.r.db.webhookEvent.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        type: event.type,
        payload: { objectId: object.id },
      },
      update: {},
    });
    return { received: true };
  }
  async processReceipt(id: string) {
    const e = await this.r.db.webhookEvent.findUniqueOrThrow({ where: { id } });
    if (e.state === "PROCESSED") return;
    await this.r.db.webhookEvent.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    try {
      const objectId = (e.payload as { objectId: string }).objectId;
      if (e.type.startsWith("checkout.session.")) {
        const s = await this.r.stripe!.checkout.sessions.retrieve(objectId);
        await this.reconcile(s);
      } else if (e.type.startsWith("refund."))
        await this.reconcileRefund(objectId);
      else if (e.type === "charge.refunded") {
        const charge = await this.r.stripe!.charges.retrieve(objectId);
        const refunds = await this.r.stripe!.refunds.list({
          charge: charge.id,
          limit: 100,
        });
        for (const refund of refunds.data)
          await this.reconcileRefund(refund.id);
      }
      await this.r.db.webhookEvent.update({
        where: { id },
        data: { state: "PROCESSED", processedAt: new Date(), lastError: null },
      });
    } catch {
      await this.r.db.webhookEvent.update({
        where: { id },
        data: {
          state: "RECEIVED",
          lastError: "Provider reconciliation failed",
        },
      });
      throw Error("Provider reconciliation failed");
    }
  }
  async reconcile(s: Stripe.Checkout.Session) {
    const id = s.metadata?.attemptId;
    if (!id) return;
    const a = await this.r.db.checkoutAttempt.findUnique({
      where: { id },
      include: attemptInclude,
    });
    if (!a || !a.order || s.metadata?.orderId !== a.order.id)
      throw Error("Unknown order reference");
    if (a.providerSessionId && a.providerSessionId !== s.id)
      throw Error("Session mismatch");
    if (s.payment_status === "paid") {
      if (!validPaidSession(s, a.order))
        throw Error("Payment totals or status mismatch");
      await this.confirm(s);
    } else if (s.status === "expired") {
      await this.r.db.checkoutAttempt.updateMany({
        where: { id, providerSessionId: null },
        data: { providerSessionId: s.id },
      });
      await this.checkout.release(id, "EXPIRED");
    }
  }
  private async confirm(s: Stripe.Checkout.Session) {
    const id = s.metadata!.attemptId;
    const intent =
      typeof s.payment_intent === "string"
        ? s.payment_intent
        : s.payment_intent?.id;
    if (!intent) throw Error("Payment intent missing");
    const paymentIntent = await this.r.stripe!.paymentIntents.retrieve(intent);
    if (
      paymentIntent.status !== "succeeded" ||
      paymentIntent.currency !== "eur" ||
      paymentIntent.amount_received !== s.amount_total ||
      paymentIntent.metadata.orderId !== s.metadata!.orderId
    )
      throw Error("Payment intent reconciliation failed");
    await this.r.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CheckoutAttempt" WHERE id=${id} FOR UPDATE`;
      const a = await tx.checkoutAttempt.findUniqueOrThrow({
        where: { id },
        include: attemptInclude,
      });
      const order = a.order!;
      if (
        order.paymentState === "PAID" ||
        order.paymentState === "PARTIALLY_REFUNDED" ||
        order.paymentState === "REFUNDED"
      )
        return;
      if (!validPaidSession(s, order)) throw Error("Payment mismatch");
      const priorPayment = await tx.payment.findUnique({
        where: { providerIntentId: intent },
      });
      if (priorPayment && a.state === "REVIEW") return;
      await tx.payment.create({
        data: {
          orderId: order.id,
          providerIntentId: intent,
          providerSessionId: s.id,
          amountMinor: order.totalMinor,
          currency: "eur",
          state: "SUCCEEDED",
        },
      });
      if (
        !["CREATING", "OPEN"].includes(a.state) ||
        a.reservations.some((r) => r.state !== "HELD")
      ) {
        await tx.checkoutAttempt.update({
          where: { id },
          data: { state: "REVIEW" },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paymentState: "REVIEW", fulfillmentState: "HOLD" },
        });
        await tx.auditLog.create({
          data: {
            action: "PAID_WITHOUT_ALLOCATION",
            target: order.id,
            summary: { sessionId: s.id },
          },
        });
        return;
      }
      for (const r of [...a.reservations].sort((a, b) =>
        a.variantId.localeCompare(b.variantId),
      )) {
        const n =
          await tx.$executeRaw`UPDATE "Inventory" SET "onHand"="onHand"-${r.quantity},reserved=reserved-${r.quantity},"updatedAt"=NOW() WHERE "variantId"=${r.variantId} AND reserved>=${r.quantity} AND "onHand">=${r.quantity}`;
        if (n !== 1) throw Error("Inventory allocation mismatch");
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: { state: "SOLD" },
        });
        await tx.inventoryMovement.create({
          data: {
            variantId: r.variantId,
            delta: -r.quantity,
            cause: "SALE",
            reference: order.id,
          },
        });
      }
      for (const d of order.redemptions) {
        if (d.state !== "HELD") throw Error("Discount allocation mismatch");
        await tx.discount.update({
          where: { id: d.discountId },
          data: { allocated: { decrement: 1 }, redeemed: { increment: 1 } },
        });
        await tx.discountRedemption.update({
          where: { id: d.id },
          data: { state: "REDEEMED" },
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentState: "PAID",
          billingAddress:
            (s.customer_details?.address as unknown as Prisma.InputJsonValue) ??
            undefined,
        },
      });
      await tx.checkoutAttempt.update({
        where: { id },
        data: { state: "PAID", providerSessionId: s.id },
      });
      await tx.cartItem.deleteMany({ where: { cartId: a.cartId } });
      await tx.outboxEvent.create({
        data: {
          key: `confirmation-${order.id}`,
          type: "confirmation",
          payload: { orderId: order.id },
        },
      });
    });
  }
  async reconcileRefund(id: string) {
    const provider = await this.r.stripe!.refunds.retrieve(id);
    const intent =
      typeof provider.payment_intent === "string"
        ? provider.payment_intent
        : provider.payment_intent?.id;
    if (!intent) return;
    await this.r.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE "providerIntentId"=${intent} FOR UPDATE`;
      const p = await tx.payment.findUnique({
        where: { providerIntentId: intent },
      });
      if (!p) throw Error("Unknown payment");
      if (provider.currency !== "eur") throw Error("Refund currency mismatch");
      let refund = await tx.refund.findUnique({
        where: { providerRefundId: id },
      });
      if (!refund && provider.metadata?.localRefundId)
        refund = await tx.refund.findUnique({
          where: { id: provider.metadata?.localRefundId },
        });
      if (
        refund &&
        (refund.paymentId !== p.id || refund.amountMinor !== provider.amount)
      )
        throw Error("Refund amount mismatch");
      if (refund)
        await tx.refund.update({
          where: { id: refund.id },
          data: { providerRefundId: id, status: provider.status ?? "pending" },
        });
      else
        await tx.refund.create({
          data: {
            paymentId: p.id,
            idempotencyKey: `provider-${id}`,
            providerRefundId: id,
            amountMinor: provider.amount,
            status: provider.status ?? "pending",
            reason: "Provider dashboard refund",
            actorId: "provider",
          },
        });
      const total = await tx.refund.aggregate({
        where: { paymentId: p.id, status: "succeeded" },
        _sum: { amountMinor: true },
      });
      const amount = total._sum.amountMinor ?? 0;
      if (amount > p.amountMinor) throw Error("Refund exceeds payment");
      await tx.order.updateMany({
        where: { id: p.orderId, paymentState: { not: "REVIEW" } },
        data: {
          paymentState:
            amount === 0
              ? "PAID"
              : amount === p.amountMinor
                ? "REFUNDED"
                : "PARTIALLY_REFUNDED",
        },
      });
    });
  }
}
