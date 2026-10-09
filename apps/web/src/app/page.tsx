import Image from "next/image";
import Link from "next/link";
import type { ProductPage } from "@commerce/contracts";
import { serverApi } from "../lib/server";
import { ProductCard } from "../components/product-card";
import { Notice, Empty } from "@commerce/ui";
export const dynamic = "force-dynamic";
export default async function Home() {
  let data: ProductPage | null = null;
  try {
    data = await serverApi<ProductPage>("/products?limit=4");
  } catch {}
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">The everyday edit · Vol. 01</span>
          <h1>
            Less, but
            <br />
            <em>better.</em>
          </h1>
          <p>
            Quiet confidence. Easy silhouettes. Discover pieces that make
            getting dressed feel effortless.
          </p>
          <Link className="button" href="/catalog">
            Explore the collection <span aria-hidden="true">↗</span>
          </Link>
          <span className="eyebrow" style={{ marginTop: 48 }}>
            A wardrobe, considered.
          </span>
        </div>
        <div className="hero-image">
          <Image
            src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=85"
            alt="Fashion styling in a softly lit city setting"
            fill
            priority
            sizes="(max-width:700px) 100vw,55vw"
          />
          <span className="hero-caption">FORM / FEEL / EVERY DAY</span>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Good things, thoughtfully chosen</span>
            <h2>The current collection.</h2>
          </div>
          <Link className="text-link" href="/catalog">
            Discover all ↗
          </Link>
        </div>
        {data?.items.length ? (
          <div className="product-grid">
            {data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : data ? (
          <Empty title="Our next chapter is taking shape.">
            <p>New pieces will appear here when the collection is ready.</p>
          </Empty>
        ) : (
          <Notice>
            The collection is temporarily unavailable. Please try again shortly.
          </Notice>
        )}
      </section>
      <section className="editorial">
        <div className="editorial-photo">
          <Image
            src="https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=1400&q=85"
            alt="Soft neutral knitwear with a tactile texture"
            fill
            sizes="(max-width:700px) 100vw,50vw"
          />
        </div>
        <div className="editorial-copy">
          <span className="eyebrow">The art of everyday</span>
          <h2>
            Room to move.
            <br />
            Space to be you.
          </h2>
          <p>
            Build a wardrobe around the pieces you reach for. Explore shapes,
            textures and colours that work together, season after season.
          </p>
          <Link className="text-link" href="/catalog?category=Knitwear">
            Explore knitwear ↗
          </Link>
        </div>
      </section>
      <section className="container values">
        <div>
          <span className="eyebrow">01 / A considered selection</span>
          <p>Discover fabric and care details for every piece.</p>
        </div>
        <div>
          <span className="eyebrow">02 / Your perfect fit</span>
          <p>Choose your colour and size before adding to your bag.</p>
        </div>
        <div>
          <span className="eyebrow">03 / A little peace of mind</span>
          <p>Verified email sign-in and secure hosted checkout.</p>
        </div>
      </section>
    </>
  );
}
