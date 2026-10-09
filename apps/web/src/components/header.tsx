"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@commerce/api-client";
export function Header() {
  const cart = useQuery({ queryKey: ["cart"], queryFn: api.cart });
  const count = cart.data?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
  return (
    <>
      <div className="announcement">
        Considered pieces. Everyday possibilities.
      </div>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Home">
          {process.env.NEXT_PUBLIC_BRAND_NAME ?? "Forme"}
          <span style={{ color: "var(--accent)" }}>.</span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <Link href="/catalog">The collection</Link>
          <Link href="/catalog?category=Knitwear">Knitwear</Link>
          <Link href="/collections">Our edits</Link>
        </nav>
        <div className="header-actions">
          <Link href="/catalog" aria-label="Search collection">
            Search
          </Link>
          <Link href="/account">Account</Link>
          <Link href="/cart" aria-label={`Bag, ${count} items`}>
            Bag ({count})
          </Link>
        </div>
      </header>
    </>
  );
}
