import Image from "next/image";
import Link from "next/link";
import { money, type Product } from "@commerce/contracts";
export function ProductCard({ product }: { product: Product }) {
  const prices = product.variants.map((v) => v.priceMinor);
  const price = prices.length ? money(Math.min(...prices)) : "Unavailable";
  const soldOut = product.variants.every((v) => v.available < 1);
  return (
    <Link className="product-card" href={`/products/${product.slug}`}>
      <div className="photo">
        {product.images[0] && (
          <Image
            src={product.images[0].url}
            alt={product.images[0].alt}
            fill
            sizes="(max-width:700px) 45vw,(max-width:1000px) 30vw,23vw"
          />
        )}
        {soldOut && <span className="tag">Sold out</span>}
      </div>
      <div className="product-meta">
        <div>
          <h3>{product.title}</h3>
          <p>
            {product.category} ·{" "}
            {new Set(product.variants.map((v) => v.color)).size} colours
          </p>
        </div>
        <span className="price">{price}</span>
      </div>
    </Link>
  );
}
