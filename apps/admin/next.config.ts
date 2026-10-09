import path from "node:path";
import type { NextConfig } from "next";
const config: NextConfig = {
  experimental: { useTypeScriptCli: false },
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: [
    "@commerce/ui",
    "@commerce/contracts",
    "@commerce/api-client",
  ],
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      ...(process.env.NEXT_PUBLIC_CDN_URL
        ? [
            {
              protocol: new URL(process.env.NEXT_PUBLIC_CDN_URL).protocol.slice(
                0,
                -1,
              ) as "http" | "https",
              hostname: new URL(process.env.NEXT_PUBLIC_CDN_URL).hostname,
              port: new URL(process.env.NEXT_PUBLIC_CDN_URL).port,
              pathname: `${new URL(process.env.NEXT_PUBLIC_CDN_URL).pathname.replace(/\/$/, "")}/**`,
            },
          ]
        : []),
    ],
  },
  poweredByHeader: false,
};
export default config;
