import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  productInput,
  productUpdateInput,
  stockInput,
} from "@commerce/contracts";
import type { Prisma } from "@commerce/database";
import { Runtime } from "../../common/runtime.js";
export const productInclude = {
  images: { orderBy: { position: "asc" as const } },
  variants: { include: { inventory: true }, orderBy: { id: "asc" as const } },
};
export function presentProduct(
  product: Prisma.ProductGetPayload<{ include: typeof productInclude }>,
) {
  return {
    ...product,
    variants: product.variants.map(({ inventory, ...v }) => ({
      ...v,
      available: inventory ? inventory.onHand - inventory.reserved : 0,
    })),
  };
}
@Injectable()
export class CatalogService {
  constructor(@Inject(Runtime) readonly r: Runtime) {}
  async list(
    query: {
      q?: string;
      category?: string;
      collection?: string;
      cursor?: string;
      limit?: string;
    },
    admin = false,
  ) {
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 24));
    const items = await this.r.db.product.findMany({
      where: {
        ...(admin ? {} : { status: "PUBLISHED" }),
        ...(query.q
          ? {
              OR: [
                {
                  title: {
                    contains: query.q.slice(0, 100),
                    mode: "insensitive" as const,
                  },
                },
                {
                  description: {
                    contains: query.q.slice(0, 100),
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.collection
          ? {
              collections: { some: { collection: { slug: query.collection } } },
            }
          : {}),
        ...(query.cursor ? { id: { gt: query.cursor } } : {}),
      },
      include: productInclude,
      orderBy: { id: "asc" },
      take: limit + 1,
    });
    const more = items.length > limit;
    if (more) items.pop();
    return {
      items: items.map(presentProduct),
      nextCursor: more ? items.at(-1)!.id : null,
    };
  }
  async bySlug(slug: string) {
    const p = await this.r.db.product.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: productInclude,
    });
    if (!p) throw new NotFoundException("Product not found");
    return presentProduct(p);
  }
  async create(input: unknown, actorId: string) {
    const data = productInput.parse(input);
    const url = new URL(data.imageUrl);
    const cdn = this.r.env.STORAGE_CDN_URL;
    if (this.r.env.NODE_ENV === "production" && url.protocol !== "https:")
      throw new BadRequestException("Production images require HTTPS");
    const storageKey = cdn
      ? data.imageUrl.replace(`${cdn.replace(/\/$/, "")}/`, "").split("?")[0]
      : url.pathname;
    if (
      !(cdn && url.origin === new URL(cdn).origin) &&
      !(
        this.r.env.NODE_ENV !== "production" &&
        url.hostname === "images.unsplash.com"
      )
    )
      throw new BadRequestException(
        "Images must use the configured storage CDN",
      );
    const p = await this.r.db.$transaction(async (tx) => {
      if (cdn && this.r.env.NODE_ENV === "production") {
        const upload = await tx.mediaUpload.findFirst({
          where: { storageKey, actorId, state: "UPLOADED" },
        });
        if (!upload || !data.imageUrl.startsWith(`${cdn.replace(/\/$/, "")}/`))
          throw new BadRequestException(
            "Use a finalized upload owned by your staff account",
          );
        await tx.mediaUpload.update({
          where: { id: upload.id },
          data: { state: "FINALIZED" },
        });
      }
      const p = await tx.product.create({
        data: {
          title: data.title,
          slug: data.slug,
          description: data.description,
          category: data.category,
          fabricCare: data.fabricCare,
          images: {
            create: { url: data.imageUrl, storageKey, alt: data.imageAlt },
          },
          variants: {
            create: data.variants.map(({ onHand, ...v }) => ({
              ...v,
              inventory: { create: { onHand } },
              movements: {
                create: { delta: onHand, cause: "INITIAL_STOCK", actorId },
              },
            })),
          },
        },
        include: productInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "PRODUCT_CREATED",
          target: p.id,
          summary: { variants: p.variants.length },
        },
      });
      return p;
    });
    return presentProduct(p);
  }
  async publish(id: string, actorId: string) {
    return this.r.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} FOR UPDATE`;
      const p = await tx.product.findUnique({
        where: { id },
        include: productInclude,
      });
      if (!p) throw new NotFoundException("Product not found");
      if (
        !p.images.length ||
        !p.variants.length ||
        !p.fabricCare ||
        p.variants.some(
          (v) => !v.inventory || v.priceMinor <= 0 || v.currency !== "eur",
        )
      )
        throw new BadRequestException(
          "Images, variants, EUR prices, care and inventory are required",
        );
      const result = await tx.product.update({
        where: { id },
        data: { status: "PUBLISHED" },
        include: productInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "PRODUCT_PUBLISHED",
          target: id,
          summary: { status: "PUBLISHED" },
        },
      });
      return presentProduct(result);
    });
  }
  async get(id: string) {
    const p = await this.r.db.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!p) throw new NotFoundException("Product not found");
    return presentProduct(p);
  }
  async update(id: string, input: unknown, actorId: string) {
    const data = productUpdateInput.parse(input);
    return this.r.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id=${id} FOR UPDATE`;
      const existing = await tx.product.findUnique({
        where: { id },
        include: { variants: true },
      });
      if (!existing) throw new NotFoundException("Product not found");
      if (
        data.variants.length !== existing.variants.length ||
        new Set(data.variants.map((v) => v.id)).size !== data.variants.length ||
        data.variants.some(
          (v) => !existing.variants.some((old) => old.id === v.id),
        )
      )
        throw new BadRequestException(
          "Variant ownership and membership must match",
        );
      for (const variant of data.variants) {
        const { id: variantId, ...fields } = variant;
        await tx.productVariant.update({
          where: { id: variantId },
          data: fields,
        });
      }
      const { variants: _variants, ...fields } = data;
      const p = await tx.product.update({
        where: { id },
        data: fields,
        include: productInclude,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "PRODUCT_UPDATED",
          target: id,
          summary: { variants: data.variants.length },
        },
      });
      return presentProduct(p);
    });
  }
  async adjust(variantId: string, input: unknown, actorId: string) {
    const data = stockInput.parse(input);
    return this.r.db.$transaction(async (tx) => {
      const n =
        await tx.$executeRaw`UPDATE "Inventory" SET "onHand"="onHand"+${data.delta}, "updatedAt"=NOW() WHERE "variantId"=${variantId} AND "onHand"+${data.delta}>="reserved"`;
      if (n !== 1)
        throw new BadRequestException(
          "Adjustment would remove reserved stock or variant does not exist",
        );
      await tx.inventoryMovement.create({
        data: { variantId, delta: data.delta, cause: data.reason, actorId },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "STOCK_ADJUSTED",
          target: variantId,
          summary: data,
        },
      });
      return tx.inventory.findUnique({ where: { variantId } });
    });
  }
}
