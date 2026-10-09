import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/providers";
import { Header } from "../components/header";
import { Footer } from "../components/footer";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Forme";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SHOP_ORIGIN ?? "http://localhost:3000",
  ),
  title: {
    default: `${brand} — A considered wardrobe`,
    template: `%s | ${brand}`,
  },
  description:
    "Explore considered clothing, relaxed silhouettes and everyday essentials.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
