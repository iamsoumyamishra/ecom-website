import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { ApiTags, ApiQuery, ApiResponse } from "@nestjs/swagger";
import { CatalogService } from "./catalog.service.js";
@ApiTags("catalog")
@Controller("api/v1")
export class CatalogController {
  constructor(@Inject(CatalogService) readonly catalog: CatalogService) {}
  @Get("products")
  @ApiQuery({ name: "q", required: false })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "cursor", required: false })
  @ApiResponse({
    status: 200,
    description:
      "Published products with EUR variants, available stock, and nextCursor",
  })
  list(
    @Query()
    query: {
      q?: string;
      category?: string;
      collection?: string;
      cursor?: string;
      limit?: string;
    },
  ) {
    return this.catalog.list(query);
  }
  @Get("products/:slug") product(@Param("slug") slug: string) {
    return this.catalog.bySlug(slug);
  }
  @Get("collections") collections() {
    return this.catalog.r.db.collection.findMany({
      include: {
        products: {
          where: { product: { status: "PUBLISHED" } },
          select: { productId: true },
        },
      },
      orderBy: { id: "asc" },
      take: 50,
    });
  }
  @Get("checkout-config") config() {
    const e = this.catalog.r.env;
    return {
      countries: e.SHIPPING_COUNTRIES.split(",").filter(Boolean),
      shippingMinor: e.SHIPPING_PRICE_MINOR,
      taxPolicy: e.TAX_POLICY ?? "unconfigured",
      configured: !!(
        e.STRIPE_SECRET_KEY &&
        e.STRIPE_PAYMENT_METHOD_CONFIGURATION &&
        e.TAX_POLICY &&
        e.SHIPPING_COUNTRIES
      ),
    };
  }
  @Get("policies/:policy") async policy(@Param("policy") policy: string) {
    return (
      (
        await this.catalog.r.db.setting.findUnique({
          where: { key: `policy-${policy}` },
        })
      )?.value ?? null
    );
  }
  @Get("filters") async filters() {
    const categories = await this.catalog.r.db.product.findMany({
      where: { status: "PUBLISHED" },
      distinct: ["category"],
      select: { category: true },
      take: 100,
    });
    return { categories: categories.map((x) => x.category) };
  }
}
