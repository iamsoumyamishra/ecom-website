import Link from "next/link";
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Link className="wordmark" href="/">
            {process.env.NEXT_PUBLIC_BRAND_NAME ?? "Forme"}.
          </Link>
          <p className="muted" style={{ maxWidth: 270, fontSize: 12 }}>
            A considered wardrobe.
            <br />
            Made for the way you move through life.
          </p>
        </div>
        <nav className="footer-links" aria-label="Shop">
          <span className="eyebrow">Explore</span>
          <Link href="/catalog">The collection</Link>
          <Link href="/collections">Our edits</Link>
          <Link href="/account">Your account</Link>
        </nav>
        <nav className="footer-links" aria-label="Customer care">
          <span className="eyebrow">Customer care</span>
          <Link href="/policies/delivery">Delivery & returns</Link>
          <Link href="/policies/privacy">Privacy</Link>
          <Link href="/policies/terms">Terms of service</Link>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()}{" "}
          {process.env.NEXT_PUBLIC_BRAND_NAME ?? "Forme"}
        </span>
        <span>Prices in EUR · Secure checkout with Stripe</span>
      </div>
    </footer>
  );
}
