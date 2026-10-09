// Server route entrypoint only. Never re-export from the browser client.
export function proxyFor(app: "shop" | "admin") {
  return async function proxy(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> },
  ) {
    const origin =
      process.env[app === "shop" ? "SHOP_ORIGIN" : "ADMIN_ORIGIN"] ??
      (app === "shop" ? "http://localhost:3000" : "http://localhost:3001");
    const { path } = await params;
    const webhook =
      app === "shop" &&
      request.method === "POST" &&
      path.join("/") === "webhooks/stripe";
    if (
      !webhook &&
      !["GET", "HEAD"].includes(request.method) &&
      request.headers.get("origin") !== origin
    )
      return Response.json({ message: "Origin not allowed" }, { status: 403 });
    const secret = process.env.PROXY_SECRET;
    if (!secret)
      return Response.json(
        { message: "API routing is not configured" },
        { status: 503 },
      );
    const url = new URL(request.url);
    const target = new URL(
      `/api/${path.map(encodeURIComponent).join("/")}?${url.searchParams}`,
      process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000",
    );
    const headers = new Headers({
      "x-commerce-origin": origin,
      "x-commerce-proxy": secret,
      "x-commerce-client-ip": "frontend-proxy",
    });
    for (const key of [
      "cookie",
      "content-type",
      "origin",
      "stripe-signature",
      "accept",
    ]) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    try {
      let body: ArrayBuffer | undefined;
      if (request.body && !["GET", "HEAD"].includes(request.method)) {
        const maxBytes = path.includes("media")
          ? 10 * 1024 * 1024
          : webhook
            ? 1024 * 1024
            : 128 * 1024;
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          total += chunk.value.byteLength;
          if (total > maxBytes) {
            await reader.cancel();
            return Response.json(
              { message: "Request too large" },
              { status: 413 },
            );
          }
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        body = bytes.buffer;
      }
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(45000),
      });
      const responseHeaders = new Headers({
        "cache-control": "no-store",
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
      });
      for (const cookie of upstream.headers.getSetCookie())
        responseHeaders.append("set-cookie", cookie);
      for (const name of ["x-request-id", "retry-after"]) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch {
      return Response.json(
        { message: "The commerce service is unavailable. Please try again." },
        { status: 503 },
      );
    }
  };
}
