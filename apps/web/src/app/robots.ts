import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/login", "/cart", "/checkout", "/api"],
    },
    sitemap: `${process.env.NEXT_PUBLIC_SHOP_ORIGIN ?? "http://localhost:3000"}/sitemap.xml`,
  };
}
