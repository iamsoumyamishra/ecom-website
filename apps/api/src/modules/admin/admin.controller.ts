import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiCookieAuth, ApiBody } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { discountInput } from "@commerce/contracts";
import { Runtime } from "../../common/runtime.js";
import { AuthService } from "../auth/auth.service.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { MediaService } from "../media/media.service.js";
@ApiTags("admin")
@ApiCookieAuth()
@Controller("api/v1/admin")
export class AdminController {
  constructor(
    @Inject(Runtime) readonly r: Runtime,
    @Inject(AuthService) readonly auth: AuthService,
    @Inject(CatalogService) readonly catalog: CatalogService,
    @Inject(OrdersService) readonly orders: OrdersService,
    @Inject(MediaService) readonly media: MediaService,
  ) {}
  @Get("products") async products(
    @Req() req: Request,
    @Query() query: { cursor?: string; limit?: string },
  ) {
    await this.auth.staff(req);
    return this.catalog.list(query, true);
  }
  @Post("products")
  @ApiBody({ schema: { $ref: "#/components/schemas/ProductInput" } })
  async create(@Req() req: Request, @Body() body: unknown) {
    return this.catalog.create(body, (await this.auth.staff(req)).user.id);
  }
  @Get("products/:id") async product(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await this.auth.staff(req);
    return this.catalog.get(id);
  }
  @Patch("products/:id") async updateProduct(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.update(id, body, (await this.auth.staff(req)).user.id);
  }
  @Post("products/:id/publish") async publish(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    return this.catalog.publish(id, (await this.auth.staff(req)).user.id);
  }
  @Post("inventory/:id") async adjust(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.adjust(id, body, (await this.auth.staff(req)).user.id);
  }
  @Get("orders") async orderList(
    @Req() req: Request,
    @Query("cursor") cursor?: string,
  ) {
    await this.auth.staff(req);
    return this.orders.list(undefined, cursor);
  }
  @Post("orders/:id/shipments") async ship(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.orders.ship(id, body, (await this.auth.staff(req)).user.id);
  }
  @Post("orders/:id/refunds") async refund(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.orders.refund(
      id,
      body,
      (await this.auth.staff(req, false, true)).user.id,
    );
  }
  @Get("customers") async customers(
    @Req() req: Request,
    @Query("cursor") cursor?: string,
  ) {
    await this.auth.staff(req);
    return {
      items: await this.r.db.user.findMany({
        where: { role: "CUSTOMER", ...(cursor ? { id: { gt: cursor } } : {}) },
        select: {
          id: true,
          name: true,
          email: true,
          disabled: true,
          createdAt: true,
        },
        orderBy: { id: "asc" },
        take: 25,
      }),
    };
  }
  @Get("audit") async audit(
    @Req() req: Request,
    @Query("cursor") cursor?: string,
  ) {
    await this.auth.staff(req);
    return {
      items: await this.r.db.auditLog.findMany({
        where: cursor ? { id: { lt: cursor } } : {},
        orderBy: { id: "desc" },
        take: 25,
      }),
    };
  }
  @Get("discounts") async discounts(@Req() req: Request) {
    await this.auth.staff(req);
    return {
      items: await this.r.db.discount.findMany({
        orderBy: { id: "asc" },
        take: 50,
      }),
    };
  }
  @Post("discounts") async discount(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const s = await this.auth.staff(req);
    const data = discountInput.parse(body);
    return this.r.db.$transaction(async (tx) => {
      const d = await tx.discount.create({
        data: {
          ...data,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: s.user.id,
          action: "DISCOUNT_CREATED",
          target: d.id,
          summary: { code: d.code },
        },
      });
      return d;
    });
  }
  @Get("staff") async staff(@Req() req: Request) {
    await this.auth.staff(req, true);
    return {
      items: await this.r.db.user.findMany({
        where: { role: { in: ["STAFF", "OWNER"] } },
        select: { id: true, email: true, role: true, disabled: true },
        take: 100,
      }),
    };
  }
  @Post("staff") async invite(@Req() req: Request, @Body() body: unknown) {
    const s = await this.auth.staff(req, true, true);
    const { email } = z
      .object({ email: z.email().transform((v) => v.trim().toLowerCase()) })
      .strict()
      .parse(body);
    return this.r.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: randomUUID(),
          name: "Staff",
          email,
          role: "STAFF",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: s.user.id,
          action: "STAFF_INVITED",
          target: user.id,
          summary: { role: "STAFF" },
        },
      });
      return { id: user.id };
    });
  }
  @Get("collections") async collections(@Req() req: Request) {
    await this.auth.staff(req);
    return {
      items: await this.r.db.collection.findMany({
        orderBy: { id: "asc" },
        take: 50,
      }),
    };
  }
  @Post("collections") async collection(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const session = await this.auth.staff(req);
    const d = z
      .object({
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        title: z.string().min(2).max(160),
        description: z.string().min(1).max(2000),
        productIds: z.array(z.string()).max(100),
      })
      .strict()
      .parse(body);
    return this.r.db.$transaction(async (tx) => {
      const c = await tx.collection.create({
        data: {
          slug: d.slug,
          title: d.title,
          description: d.description,
          products: {
            create: d.productIds.map((productId) => ({ productId })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          action: "COLLECTION_CREATED",
          target: c.id,
          summary: { products: d.productIds.length },
        },
      });
      return c;
    });
  }
  @Put("policies/:policy") async policy(
    @Req() req: Request,
    @Param("policy") policy: string,
    @Body() body: unknown,
  ) {
    const session = await this.auth.staff(req, true, true);
    z.enum(["delivery", "terms", "privacy"]).parse(policy);
    const d = z
      .object({
        title: z.string().min(3).max(100),
        content: z.string().min(50).max(30000),
      })
      .strict()
      .parse(body);
    return this.r.db.$transaction(async (tx) => {
      const setting = await tx.setting.upsert({
        where: { key: `policy-${policy}` },
        create: { key: `policy-${policy}`, value: d },
        update: { value: d },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          action: "POLICY_PUBLISHED",
          target: setting.key,
          summary: { policy },
        },
      });
      return { success: true };
    });
  }
  @Patch("staff/:id") async changeStaff(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const session = await this.auth.staff(req, true, true);
    const data = z.object({ disabled: z.boolean() }).strict().parse(body);
    return this.r.db.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target || target.role !== "STAFF")
        throw new Error("Only staff accounts can be changed here");
      await tx.user.update({ where: { id }, data });
      if (data.disabled) await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({
        data: {
          actorId: session.user.id,
          action: "STAFF_ACCESS_CHANGED",
          target: id,
          summary: data,
        },
      });
      return { success: true };
    });
  }
  @Get("settings") async settings(@Req() req: Request) {
    await this.auth.staff(req);
    const e = this.r.env;
    return {
      brandName: e.BRAND_NAME,
      shippingCountries: e.SHIPPING_COUNTRIES.split(",").filter(Boolean),
      shippingPriceMinor: e.SHIPPING_PRICE_MINOR,
      taxPolicy: e.TAX_POLICY ?? "unconfigured",
      emailConfigured: !!e.RESEND_API_KEY,
      paymentConfigured: !!e.STRIPE_SECRET_KEY,
      storageConfigured: !!e.STORAGE_BUCKET,
    };
  }
  @Get("overview") async overview(@Req() req: Request) {
    await this.auth.staff(req);
    const [paid, refunds, pending, outbox, webhooks] = await Promise.all([
      this.r.db.payment.aggregate({
        where: { state: "SUCCEEDED" },
        _sum: { amountMinor: true },
      }),
      this.r.db.refund.aggregate({
        where: { status: "succeeded" },
        _sum: { amountMinor: true },
      }),
      this.r.db.order.count({
        where: {
          paymentState: { in: ["PAID", "PARTIALLY_REFUNDED"] },
          fulfillmentState: "UNFULFILLED",
        },
      }),
      this.r.db.outboxEvent.count({ where: { state: "PENDING" } }),
      this.r.db.webhookEvent.count({ where: { state: "RECEIVED" } }),
    ]);
    return {
      revenueMinor:
        (paid._sum.amountMinor ?? 0) - (refunds._sum.amountMinor ?? 0),
      unfulfilledOrders: pending,
      pendingNotifications: outbox,
      pendingWebhooks: webhooks,
    };
  }
  @Post("media") async ticket(@Req() req: Request, @Body() body: unknown) {
    return this.media.ticket(body, (await this.auth.staff(req)).user.id);
  }
  @Put("media/:id") async upload(
    @Req() req: Request,
    @Param("id") id: string,
    @Query("signature") signature: string,
    @Body() body: Buffer,
  ) {
    return this.media.upload(
      id,
      signature,
      body,
      (await this.auth.staff(req)).user.id,
    );
  }
}
