import Link from "next/link";
import { serverApi } from "../../lib/server";
import { Empty, Notice } from "@commerce/ui";
export const metadata = {
  title: "Our edits",
  alternates: { canonical: "/collections" },
};
export default async function Collections() {
  let collections:
    { id: string; slug: string; title: string; description: string }[] | null =
    null;
  try {
    collections = await serverApi("/collections");
  } catch {}
  return (
    <div className="container section">
      <div className="page-heading">
        <span className="eyebrow">Pieces that belong together</span>
        <h1>Our edits.</h1>
      </div>
      {!collections ? (
        <Notice>Our edits are temporarily unavailable.</Notice>
      ) : collections.length ? (
        <div className="product-grid">
          {collections.map((c) => (
            <Link
              className="admin-panel"
              key={c.id}
              href={`/collections/${c.slug}`}
            >
              <span className="eyebrow">The considered edit</span>
              <h2 style={{ margin: "20px 0" }}>{c.title}</h2>
              <p className="muted">{c.description}</p>
              <span
                className="text-link"
                style={{ display: "block", marginTop: 24 }}
              >
                Explore the edit ↗
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="A new edit is on its way.">
          <p>Explore the complete collection while we put it together.</p>
          <Link className="button" href="/catalog">
            View the collection
          </Link>
        </Empty>
      )}
    </div>
  );
}
