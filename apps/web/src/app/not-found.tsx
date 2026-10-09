import Link from "next/link";
export default function NotFound() {
  return (
    <div className="container section">
      <h1>Page not found.</h1>
      <p style={{ margin: "24px 0" }}>
        This page or product is no longer available.
      </p>
      <Link className="button" href="/">
        Return home
      </Link>
    </div>
  );
}
