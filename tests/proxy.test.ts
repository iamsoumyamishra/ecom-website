import { afterEach, it, expect, vi } from "vitest";
import { proxyFor } from "../packages/api-client/src/proxy.js";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sets trusted routing headers and forwards separate cookies without accepting spoofed proxy headers", async () => {
  vi.stubEnv("PROXY_SECRET", "test-proxy");
  vi.stubEnv("SHOP_ORIGIN", "http://localhost:3000");
  const mock = vi.fn().mockResolvedValue(
    new Response("{}", {
      headers: [
        ["set-cookie", "one=1; HttpOnly"],
        ["set-cookie", "two=2; HttpOnly"],
      ],
    }),
  );
  vi.stubGlobal("fetch", mock);
  const request = new Request("http://localhost:3000/api/auth/get-session", {
    headers: {
      cookie: "session=opaque",
      "x-commerce-proxy": "attacker",
      "x-forwarded-host": "evil.example",
    },
  });
  const response = await proxyFor("shop")(request, {
    params: Promise.resolve({ path: ["auth", "get-session"] }),
  });
  const options = mock.mock.calls[0][1];
  expect(options.headers.get("x-commerce-proxy")).toBe("test-proxy");
  expect(options.headers.get("x-forwarded-host")).toBeNull();
  expect(options.headers.get("cookie")).toBe("session=opaque");
  expect(response.headers.getSetCookie()).toHaveLength(2);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects a cross-origin mutation before reaching the API", async () => {
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  const result = await proxyFor("shop")(
    new Request("http://localhost:3000/api/v1/cart/items", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: "{}",
    }),
    { params: Promise.resolve({ path: ["v1", "cart", "items"] }) },
  );
  expect(result.status).toBe(403);
  expect(mock).not.toHaveBeenCalled();
});
it("bounds non-media requests before forwarding upstream", async () => {
  vi.stubEnv("PROXY_SECRET", "test-proxy");
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  const request = new Request(
    "http://localhost:3000/api/auth/sign-in/email-otp",
    {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: "x".repeat(200000),
    },
  );
  const result = await proxyFor("shop")(request, {
    params: Promise.resolve({ path: ["auth", "sign-in", "email-otp"] }),
  });
  expect(result.status).toBe(413);
  expect(mock).not.toHaveBeenCalled();
});

it("forwards signed shop webhooks without a browser origin and preserves raw bytes", async () => {
  vi.stubEnv("PROXY_SECRET", "test-proxy");
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ received: true }));
  vi.stubGlobal("fetch", fetchMock);
  const body = '{ "data": "raw bytes" }';
  const response = await proxyFor("shop")(
    new Request("http://localhost:3000/api/webhooks/stripe", {
      method: "POST",
      headers: {
        "stripe-signature": "test-signature",
        "content-type": "application/json",
      },
      body,
    }),
    { params: Promise.resolve({ path: ["webhooks", "stripe"] }) },
  );
  expect(response.status).toBe(200);
  const options = fetchMock.mock.calls[0][1];
  expect(new TextDecoder().decode(options.body)).toBe(body);
  expect(options.headers.get("stripe-signature")).toBe("test-signature");
  const admin = await proxyFor("admin")(
    new Request("http://localhost:3001/api/webhooks/stripe", {
      method: "POST",
      body,
    }),
    { params: Promise.resolve({ path: ["webhooks", "stripe"] }) },
  );
  expect(admin.status).toBe(403);
});
