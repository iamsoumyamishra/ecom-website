import { serverApi } from "../../../lib/server";
import type { ProductPage } from "@commerce/contracts";
import { ProductCard } from "../../../components/product-card";
import { Empty } from "@commerce/ui";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await serverApi<ProductPage>(
    `/products?collection=${encodeURIComponent(slug)}`,
  );
  return (
    <div className="container section">
      <div className="page-heading">
        <span className="eyebrow">The considered edit</span>
        <h1>{slug.replaceAll("-", " ")}.</h1>
      </div>
      {data.items.length ? (
        <div className="product-grid">
          {data.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <Empty title="This edit is taking shape.">
          <p>New pieces will appear soon.</p>
        </Empty>
      )}
    </div>
  );
}
