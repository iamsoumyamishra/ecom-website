import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { shipmentInput, refundInput } from "@commerce/contracts";
import { Runtime } from "../../common/runtime.js";
export const orderInclude = {
  items: true,
  shipments: true,
  payments: { include: { refunds: true } },
};
@Injectable()
export class OrdersService {
  constructor(@Inject(Runtime) readonly r: Runtime) {}
  async list(userId?: string, cursor?: string) {
    const items = await this.r.db.order.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: orderInclude,
      orderBy: { id: "desc" },
      take: 25,
    });
    return { items, nextCursor: items.length === 25 ? items.at(-1)!.id : null };
  }
  async get(userId: string, id: string) {
    const order = await this.r.db.order.findFirst({
      where: { id, userId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }
  async ship(id: string, input: unknown, actorId: string) {
    const data = shipmentInput.parse(input);
    return this.r.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id=${id} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id },
        include: { shipments: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      const previous = order.shipments.find(
        (s) => s.trackingReference === data.trackingReference,
      );
      if (previous) return previous;
      if (
        !["PAID", "PARTIALLY_REFUNDED"].includes(order.paymentState) ||
        !["UNFULFILLED", "PACKING"].includes(order.fulfillmentState)
      )
        throw new BadRequestException("Only allocated paid orders can ship");
      const shipment = await tx.shipment.create({
        data: { orderId: id, ...data },
      });
      await tx.order.update({
        where: { id },
        data: { fulfillmentState: "SHIPPED" },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "ORDER_SHIPPED",
          target: id,
          summary: { carrier: data.carrier },
        },
      });
      await tx.outboxEvent.create({
        data: {
          key: `shipment-${shipment.id}`,
          type: "shipment",
          payload: { orderId: id },
        },
      });
      return shipment;
    });
  }
  async refund(id: string, input: unknown, actorId: string) {
    const data = refundInput.parse(input);
    if (!this.r.stripe)
      throw new ServiceUnavailableException("Payments are not configured");
    const local = await this.r.db.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { orderId: id, state: "SUCCEEDED" },
      });
      if (!payment) throw new NotFoundException("Confirmed payment not found");
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${payment.id} FOR UPDATE`;
      const previous = await tx.refund.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (previous) {
        if (
          previous.paymentId !== payment.id ||
          previous.amountMinor !== data.amountMinor ||
          previous.reason !== data.reason
        )
          throw new ConflictException("Refund key is already used");
        return { refund: previous, payment };
      }
      const aggregate = await tx.refund.aggregate({
        where: {
          paymentId: payment.id,
          status: { notIn: ["failed", "canceled"] },
        },
        _sum: { amountMinor: true },
      });
      if (
        data.amountMinor + (aggregate._sum.amountMinor ?? 0) >
        payment.amountMinor
      )
        throw new BadRequestException("Refund exceeds remaining payment");
      const refund = await tx.refund.create({
        data: { paymentId: payment.id, ...data, actorId },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "REFUND_REQUESTED",
          target: id,
          summary: { amountMinor: data.amountMinor, refundId: refund.id },
        },
      });
      return { refund, payment };
    });
    if (local.refund.providerRefundId) return local.refund;
    try {
      const provider = await this.r.stripe.refunds.create(
        {
          payment_intent: local.payment.providerIntentId,
          amount: local.refund.amountMinor,
          metadata: { localRefundId: local.refund.id },
        },
        { idempotencyKey: `refund-${local.refund.id}` },
      );
      return await this.r.db.refund.update({
        where: { id: local.refund.id },
        data: {
          providerRefundId: provider.id,
        },
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        error.type === "StripeInvalidRequestError"
      ) {
        await this.r.db.refund.update({
          where: { id: local.refund.id },
          data: { status: "failed" },
        });
        throw new BadRequestException(
          "The payment provider rejected this refund",
        );
      }
      throw new ServiceUnavailableException(
        "Refund response is uncertain; retry using the same request key",
      );
    }
  }
}
