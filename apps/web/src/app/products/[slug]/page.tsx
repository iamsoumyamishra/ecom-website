import { ApiError } from "@commerce/api-client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Product } from "@commerce/contracts";
import { serverApi } from "../../../lib/server";
import { ProductDetail } from "../../../features/product-detail";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const p = await serverApi<Product>(`/products/${encodeURIComponent(slug)}`);
    return {
      title: p.title,
      description: p.description.slice(0, 160),
      alternates: { canonical: `/products/${slug}` },
      openGraph: { images: p.images.map((i) => i.url) },
    };
  } catch {
    return { title: "Product unavailable" };
  }
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let p: Product;
  try {
    p = await serverApi<Product>(`/products/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const origin = process.env.NEXT_PUBLIC_SHOP_ORIGIN ?? "http://localhost:3000";
  const structured = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description,
    image: p.images.map((i) => i.url),
    offers: p.variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku,
      priceCurrency: "EUR",
      price: (v.priceMinor / 100).toFixed(2),
      availability:
        v.available > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: `${origin}/products/${p.slug}`,
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structured).replace(/</g, "\u003c"),
        }}
      />
      <ProductDetail product={p} />
    </>
  );
}
