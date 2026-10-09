import { Inject, Injectable } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import { orderEmail } from "@commerce/email";
import { Runtime } from "../common/runtime.js";
import {
  CheckoutService,
  attemptInclude,
} from "../modules/checkout/checkout.service.js";
import { MediaService } from "../modules/media/media.service.js";
import { PaymentsService } from "../modules/payments/payments.service.js";
@Injectable()
export class JobsService {
  private timer?: NodeJS.Timeout;
  private queue?: Queue;
  private worker?: Worker;
  private receiptCursor: string | undefined;
  private refundCursor: string | undefined;
  private outboxCursor: string | undefined;
  constructor(
    @Inject(Runtime) readonly r: Runtime,
    @Inject(CheckoutService) readonly checkout: CheckoutService,
    @Inject(PaymentsService) readonly payments: PaymentsService,
    @Inject(MediaService) readonly media: MediaService,
  ) {}
  async onModuleInit() {
    const url = new URL(this.r.env.REDIS_URL);
    const connection = {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue("commerce-outbox", { connection });
    this.worker = new Worker(
      "commerce-outbox",
      async (job) => {
        const event = await this.r.db.outboxEvent.findUniqueOrThrow({
          where: { id: job.data.eventId },
        });
        if (event.state === "COMPLETED") return;
        await this.r.db.outboxEvent.update({
          where: { id: event.id },
          data: { attempts: { increment: 1 } },
        });
        try {
          if (!this.r.email) throw Error("Email not configured");
          const order = await this.r.db.order.findUniqueOrThrow({
            where: { id: (event.payload as { orderId: string }).orderId },
          });
          const content = await orderEmail(
            this.r.env.BRAND_NAME,
            order.number,
            event.type,
            this.r.env.SUPPORT_EMAIL,
          );
          const response = await this.r.email.emails.send(
            {
              from: this.r.env.EMAIL_FROM,
              to: order.email,
              subject: `${this.r.env.BRAND_NAME} · Order ${order.number}`,
              ...content,
            },
            { idempotencyKey: event.key },
          );
          if (response.error) throw Error("Email rejected");
          await this.r.db.outboxEvent.update({
            where: { id: event.id },
            data: {
              state: "COMPLETED",
              completedAt: new Date(),
              lastError: null,
            },
          });
        } catch {
          await this.r.db.outboxEvent.update({
            where: { id: event.id },
            data: { lastError: "Email submission failed" },
          });
          throw Error("Email submission failed");
        }
      },
      { connection, concurrency: 4 },
    );
    this.worker.on("error", () => this.r.log.error("Queue worker unavailable"));
    this.queue.on("error", () => this.r.log.error("Queue unavailable"));
    this.timer = setInterval(() => {
      void this.tick();
    }, 15000);
    this.timer.unref();
    void this.tick();
  }
  async tick() {
    const token = randomUUID();
    let acquired = false;
    let renewal: NodeJS.Timeout | undefined;
    try {
      acquired =
        (await this.r.redis.set(
          "commerce-scheduler",
          token,
          "EX",
          120,
          "NX",
        )) === "OK";
      if (!acquired) return;
      renewal = setInterval(() => {
        void this.r.redis
          .eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('EXPIRE',KEYS[1],120) end return 0",
            1,
            "commerce-scheduler",
            token,
          )
          .catch(() => this.r.log.error("Scheduler lease renewal unavailable"));
      }, 30000);
      renewal.unref();
      // Job IDs deduplicate queue submissions. PostgreSQL intent remains pending until provider acceptance.
      await this.media
        .cleanup()
        .catch(() => this.r.log.error("Media cleanup unavailable"));
      const outbox = await this.r.db.outboxEvent.findMany({
        where: {
          state: "PENDING",
          ...(this.outboxCursor ? { id: { gt: this.outboxCursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 50,
      });
      this.outboxCursor = outbox.at(-1)?.id;
      for (const e of outbox) {
        const existing = await this.queue!.getJob(e.id);
        if (existing && (await existing.isFailed())) await existing.retry();
        else
          await this.queue!.add(
            e.type,
            { eventId: e.id },
            {
              jobId: e.id,
              attempts: 8,
              backoff: { type: "exponential", delay: 30000 },
              removeOnComplete: true,
              removeOnFail: false,
            },
          );
      }
      const events = await this.r.db.webhookEvent.findMany({
        where: {
          state: "RECEIVED",
          ...(this.receiptCursor ? { id: { gt: this.receiptCursor } } : {}),
        },
        orderBy: { id: "asc" },
        take: 50,
      });
      this.receiptCursor = events.at(-1)?.id;
      for (const e of events)
        await this.payments
          .processReceipt(e.id)
          .catch(() =>
            this.r.log.error(
              { eventId: e.id },
              "Webhook processing needs retry",
            ),
          );
      if (this.r.stripe) {
        const attempts = await this.r.db.checkoutAttempt.findMany({
          where: { state: { in: ["CREATING", "OPEN"] } },
          include: attemptInclude,
          orderBy: { updatedAt: "asc" },
          take: 20,
        });
        for (const a of attempts) {
          try {
            if (!a.providerSessionId) {
              await this.checkout.open(a);
              continue;
            }
            let session = await this.r.stripe.checkout.sessions.retrieve(
              a.providerSessionId,
            );
            if (
              session.status === "open" &&
              a.expiresAt.getTime() < Date.now()
            ) {
              await this.r.stripe.checkout.sessions
                .expire(session.id)
                .catch(() => undefined);
              session = await this.r.stripe.checkout.sessions.retrieve(
                session.id,
              );
            }
            await this.payments.reconcile(session);
          } catch {
            this.r.log.error(
              { attemptId: a.id },
              "Checkout reconciliation needs retry",
            );
          } finally {
            await this.r.db.checkoutAttempt.updateMany({
              where: { id: a.id },
              data: { updatedAt: new Date() },
            });
          }
        }
        const refunds = await this.r.db.refund.findMany({
          where: {
            status: { in: ["REQUESTED", "pending"] },
            ...(this.refundCursor ? { id: { gt: this.refundCursor } } : {}),
          },
          orderBy: { id: "asc" },
          include: { payment: true },
          take: 20,
        });
        this.refundCursor = refunds.at(-1)?.id;
        for (const refund of refunds) {
          try {
            let providerId = refund.providerRefundId;
            if (!providerId) {
              if (Date.now() - refund.createdAt.getTime() > 23 * 3600000) {
                await this.r.db.refund.update({
                  where: { id: refund.id },
                  data: { status: "REVIEW" },
                });
                await this.r.db.auditLog.create({
                  data: {
                    action: "REFUND_NEEDS_REVIEW",
                    target: refund.id,
                    summary: { ambiguous: true },
                  },
                });
                this.r.log.error(
                  { refundId: refund.id },
                  "Ambiguous refund requires manual review",
                );
                continue;
              }
              const p = await this.r.stripe.refunds.create(
                {
                  payment_intent: refund.payment.providerIntentId,
                  amount: refund.amountMinor,
                  metadata: { localRefundId: refund.id },
                },
                { idempotencyKey: `refund-${refund.id}` },
              );
              providerId = p.id;
              await this.r.db.refund.update({
                where: { id: refund.id },
                data: { providerRefundId: p.id },
              });
            }
            await this.payments.reconcileRefund(providerId);
          } catch {
            this.r.log.error(
              { refundId: refund.id },
              "Refund reconciliation needs retry",
            );
          }
        }
      }
    } catch {
      this.r.log.error("Background dispatcher unavailable");
    } finally {
      if (renewal) clearInterval(renewal);
      if (acquired)
        await this.r.redis
          .eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
            1,
            "commerce-scheduler",
            token,
          )
          .catch(() => undefined);
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
