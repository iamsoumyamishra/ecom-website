import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/providers";
import { Shell } from "../components/shell";
export const metadata: Metadata = {
  title: {
    default: "The studio — Shop management",
    template: "%s | The studio",
  },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
