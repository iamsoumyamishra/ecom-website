import type { MetadataRoute } from "next";
import type { ProductPage } from "@commerce/contracts";
import { serverApi } from "../lib/server";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.NEXT_PUBLIC_SHOP_ORIGIN ?? "http://localhost:3000";
  const pages: MetadataRoute.Sitemap = ["", "/catalog", "/collections"].map(
    (p) => ({ url: origin + p }),
  );
  try {
    let cursor: string | null = null;
    do {
      const data: ProductPage = await serverApi(
        `/products?limit=50${cursor ? `&cursor=${cursor}` : ""}`,
      );
      pages.push(
        ...data.items.map((p) => ({ url: `${origin}/products/${p.slug}` })),
      );
      cursor = data.nextCursor;
    } while (cursor);
  } catch {}
  return pages;
}
