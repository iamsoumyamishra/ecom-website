"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@commerce/api-client";
import { Button, Notice } from "@commerce/ui";
const links = [
  ["/", "Overview"],
  ["/products", "Products"],
  ["/inventory", "Inventory"],
  ["/orders", "Orders"],
  ["/customers", "Customers"],
  ["/discounts", "Discounts"],
  ["/collections", "Collections"],
  ["/settings", "Settings"],
  ["/staff", "Staff"],
  ["/audit", "Audit history"],
];
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: api.session });
  if (pathname === "/login") return children;
  if (session.isPending)
    return (
      <div className="container section" role="status">
        Verifying staff access…
      </div>
    );
  if (!session.data || !["STAFF", "OWNER"].includes(session.data.user.role))
    return (
      <div className="container section">
        <h1 style={{ fontSize: 50 }}>The studio.</h1>
        <Notice tone="info">
          Sign in with an invited staff email to manage the shop.
        </Notice>
        <Link
          className="button"
          href={`/login?returnTo=${encodeURIComponent(pathname)}`}
        >
          Staff sign-in
        </Link>
      </div>
    );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="wordmark">
          {process.env.NEXT_PUBLIC_BRAND_NAME ?? "Forme"}.
          <span className="eyebrow" style={{ display: "block", marginTop: 14 }}>
            The studio / Commerce
          </span>
        </Link>
        <nav className="admin-nav" aria-label="Administration">
          {links.map(([href, label]) => (
            <Link
              href={href}
              key={href}
              aria-current={
                (href === "/" ? pathname === href : pathname.startsWith(href))
                  ? "page"
                  : undefined
              }
            >
              {label}
            </Link>
          ))}
        </nav>
        <a
          className="text-link"
          href={process.env.NEXT_PUBLIC_SHOP_ORIGIN ?? "http://localhost:3000"}
        >
          View storefront ↗
        </a>
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <span>Shop management</span>
          <div className="row-actions">
            <span>{session.data.user.role.toLowerCase()}</span>
            <Button
              className="secondary"
              style={{ minHeight: 32, padding: "5px 12px" }}
              onClick={async () => {
                await api.logout();
                client.clear();
                router.push("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
