import type { Metadata } from "next";
import Link from "next/link";
import type { ProductPage } from "@commerce/contracts";
import { serverApi } from "../../lib/server";
import { ProductCard } from "../../components/product-card";
import { Empty, Notice } from "@commerce/ui";
export const metadata: Metadata = {
  title: "The collection",
  alternates: { canonical: "/catalog" },
};
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; cursor?: string }>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const k of ["q", "category", "cursor"] as const)
    if (query[k]) params.set(k, query[k]!);
  let categories: string[] = [];
  try {
    categories = (await serverApi<{ categories: string[] }>("/filters"))
      .categories;
  } catch {}
  let data: ProductPage | null = null;
  try {
    data = await serverApi<ProductPage>(`/products?${params}`);
  } catch {}
  return (
    <div className="container section">
      <div className="page-heading">
        <span className="eyebrow">Choose what feels like you</span>
        <h1>The collection.</h1>
      </div>
      <form className="filters" action="/catalog">
        <div className="field">
          <label htmlFor="q">Find a piece</label>
          <input
            id="q"
            name="q"
            placeholder="Search the collection"
            defaultValue={query.q}
          />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select
            id="category"
            name="category"
            defaultValue={query.category ?? ""}
          >
            <option value="">All pieces</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="button" type="submit">
          Explore
        </button>
        <Link className="text-link" href="/catalog">
          Clear filters
        </Link>
      </form>
      {!data ? (
        <Notice>The collection is unavailable. Please try again.</Notice>
      ) : data.items.length ? (
        <>
          <div className="product-grid">
            {data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {data.nextCursor && (
            <Link
              className="button secondary"
              style={{ marginTop: 36 }}
              href={`/catalog?${new URLSearchParams({ ...Object.fromEntries(params), cursor: data.nextCursor })}`}
            >
              Next pieces
            </Link>
          )}
        </>
      ) : (
        <Empty title="Nothing here just yet.">
          <p>Try a different search or explore the full collection.</p>
          <Link className="button" href="/catalog">
            View all pieces
          </Link>
        </Empty>
      )}
    </div>
  );
}
