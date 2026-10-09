import { ApiError } from "@commerce/api-client";
import { headers } from "next/headers";
export async function serverApi<T>(
  path: string,
  privateData = false,
): Promise<T> {
  const origin = process.env.SHOP_ORIGIN ?? "http://localhost:3000";
  const h = new Headers({
    "x-commerce-origin": origin,
    "x-commerce-proxy": process.env.PROXY_SECRET ?? "",
    "x-commerce-client-ip": "frontend-server",
  });
  if (privateData) {
    const incoming = await headers();
    h.set("cookie", incoming.get("cookie") ?? "");
  }
  const result = await fetch(
    `${process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"}/api/v1${path}`,
    { headers: h, cache: "no-store", signal: AbortSignal.timeout(5000) },
  );
  if (!result.ok)
    throw new ApiError(result.status, "Commerce service unavailable");
  return result.json() as Promise<T>;
}
