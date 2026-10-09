import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@commerce/database";
import { cartItemInput, cartQuantityInput } from "@commerce/contracts";
import { Runtime } from "../../common/runtime.js";
import { AuthService } from "../auth/auth.service.js";
import { presentProduct, productInclude } from "../catalog/catalog.service.js";
const include = {
  items: {
    include: {
      variant: {
        include: { inventory: true, product: { include: productInclude } },
      },
    },
    orderBy: { id: "asc" as const },
  },
};
const guestCookie = (req: Request) =>
  req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("commerce-guest="))
    ?.split("=")[1];
export async function lockCart(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Cart" WHERE id=${id} FOR UPDATE`;
}
export async function assertCartIdle(tx: Prisma.TransactionClient, id: string) {
  if (
    await tx.checkoutAttempt.findFirst({
      where: { cartId: id, state: { in: ["CREATING", "OPEN"] } },
    })
  )
    throw new ConflictException(
      "This bag has an active checkout. Complete it or wait for it to expire.",
    );
}
@Injectable()
export class CartsService {
  constructor(
    @Inject(Runtime) readonly r: Runtime,
    @Inject(AuthService) readonly auth: AuthService,
  ) {}
  async identify(req: Request, res: Response) {
    const session = await this.auth.session(req);
    if (session)
      return this.r.db.cart.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id },
        update: {},
      });
    let token = guestCookie(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      token = randomBytes(32).toString("hex");
      res.cookie("commerce-guest", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: this.r.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 30,
        path: "/",
      });
    }
    const guestId = createHash("sha256").update(token).digest("hex");
    return this.r.db.cart.upsert({
      where: { guestId },
      create: { guestId },
      update: {},
    });
  }
  async read(id: string) {
    const cart = await this.r.db.cart.findUniqueOrThrow({
      where: { id },
      include,
    });
    return {
      id: cart.id,
      currency: "eur",
      subtotalMinor: cart.items.reduce(
        (n, i) => n + i.quantity * i.variant.priceMinor,
        0,
      ),
      items: cart.items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        variant: {
          id: i.variant.id,
          sku: i.variant.sku,
          size: i.variant.size,
          color: i.variant.color,
          priceMinor: i.variant.priceMinor,
          currency: i.variant.currency,
          available: i.variant.inventory
            ? i.variant.inventory.onHand - i.variant.inventory.reserved
            : 0,
          product: presentProduct(i.variant.product),
        },
      })),
    };
  }
  async add(id: string, input: unknown) {
    const data = cartItemInput.parse(input);
    await this.r.db.$transaction(async (tx) => {
      await lockCart(tx, id);
      await assertCartIdle(tx, id);
      const variant = await tx.productVariant.findUnique({
        where: { id: data.variantId },
        include: { product: true, inventory: true },
      });
      if (!variant || variant.product.status !== "PUBLISHED")
        throw new BadRequestException("This product is unavailable");
      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId: id, variantId: variant.id } },
      });
      const quantity = (existing?.quantity ?? 0) + data.quantity;
      if (
        quantity > 20 ||
        quantity >
          (variant.inventory
            ? variant.inventory.onHand - variant.inventory.reserved
            : 0)
      )
        throw new BadRequestException("The requested quantity is unavailable");
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: id, variantId: variant.id } },
        create: { cartId: id, variantId: variant.id, quantity },
        update: { quantity },
      });
    });
    return this.read(id);
  }
  async update(id: string, itemId: string, input: unknown) {
    const { quantity } = cartQuantityInput.parse(input);
    await this.r.db.$transaction(async (tx) => {
      await lockCart(tx, id);
      await assertCartIdle(tx, id);
      const item = await tx.cartItem.findFirst({
        where: { id: itemId, cartId: id },
        include: { variant: { include: { inventory: true, product: true } } },
      });
      if (!item) throw new NotFoundException("Bag item not found");
      const stock = item.variant.inventory;
      if (
        item.variant.product.status !== "PUBLISHED" ||
        !stock ||
        quantity > stock.onHand - stock.reserved
      )
        throw new BadRequestException("The requested quantity is unavailable");
      await tx.cartItem.update({ where: { id: itemId }, data: { quantity } });
    });
    return this.read(id);
  }
  async remove(id: string, itemId: string) {
    await this.r.db.$transaction(async (tx) => {
      await lockCart(tx, id);
      await assertCartIdle(tx, id);
      await tx.cartItem.deleteMany({ where: { id: itemId, cartId: id } });
    });
    return this.read(id);
  }
  async merge(req: Request, res: Response) {
    const session = await this.auth.require(req);
    const target = await this.r.db.cart.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id },
      update: {},
    });
    const token = guestCookie(req);
    const guest =
      token && /^[a-f0-9]{64}$/.test(token)
        ? await this.r.db.cart.findUnique({
            where: {
              guestId: createHash("sha256").update(token).digest("hex"),
            },
          })
        : null;
    if (guest)
      await this.r.db.$transaction(async (tx) => {
        for (const id of [target.id, guest.id].sort()) await lockCart(tx, id);
        await assertCartIdle(tx, target.id);
        const items = await tx.cartItem.findMany({
          where: { cartId: guest.id },
          include: { variant: { include: { inventory: true, product: true } } },
        });
        for (const i of items) {
          if (i.variant.product.status !== "PUBLISHED") continue;
          const old = await tx.cartItem.findUnique({
            where: {
              cartId_variantId: { cartId: target.id, variantId: i.variantId },
            },
          });
          const available = i.variant.inventory
            ? i.variant.inventory.onHand - i.variant.inventory.reserved
            : 0;
          const quantity = Math.min(
            20,
            available,
            (old?.quantity ?? 0) + i.quantity,
          );
          if (quantity > 0)
            await tx.cartItem.upsert({
              where: {
                cartId_variantId: { cartId: target.id, variantId: i.variantId },
              },
              create: { cartId: target.id, variantId: i.variantId, quantity },
              update: { quantity },
            });
        }
        await tx.cartItem.deleteMany({ where: { cartId: guest.id } });
      });
    res.clearCookie("commerce-guest", { path: "/" });
    return this.read(target.id);
  }
}
