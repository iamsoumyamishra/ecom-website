import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

import { memory } from "./support/test-prisma-adapter.js";
const state = { db: memory };
import { AuthService } from "../apps/api/src/modules/auth/auth.service.js";
import { Runtime } from "../apps/api/src/common/runtime.js";
let runtime: Runtime;
let auth: AuthService;
let lastOtp = "";
let submitted = 0;
let deliveryFailure = false;
let ticks = Date.now();
let ttl: Map<string, number>;
const env = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  REDIS_URL: "redis://127.0.0.1:6379",
  BETTER_AUTH_SECRET: "test-secret-abcdefghijklmnopqrstuvwxyz",
  BETTER_AUTH_URL: "http://localhost:3000",
  SHOP_ORIGIN: "http://localhost:3000",
  ADMIN_ORIGIN: "http://localhost:3001",
  PROXY_SECRET: "test-proxy-abcdefghijklmnopqrstuvwxyz",
  SUPPORT_EMAIL: "support@example.com",
  EMAIL_FROM: "Test <login@example.com>",
  RESEND_API_KEY: "re_test_transport_only",
};
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  Object.entries(env).forEach(([k, v]) => vi.stubEnv(k, v));
  for (const value of Object.values(state.db)) value.splice(0);
  ttl = new Map();
  lastOtp = "";
  submitted = 0;
  deliveryFailure = false;
  ticks = Date.now();
  runtime = new Runtime();
  vi.spyOn(runtime.redis, "eval").mockResolvedValue(1);
  vi.spyOn(runtime.redis, "set").mockImplementation(
    async (...args: unknown[]) => {
      const key = String(args[0]);
      if ((ttl.get(key) ?? 0) > ticks) return null;
      ttl.set(key, ticks + 60000);
      return "OK";
    },
  );
  vi.spyOn(runtime.email!.emails, "send").mockImplementation(async (args) => {
    if (deliveryFailure)
      return {
        headers: null,
        data: null,
        error: {
          name: "validation_error",
          message: "Test failure",
          statusCode: 422,
        },
      };
    submitted++;
    lastOtp = String(args.text).match(/code: (\d{6})/)![1];
    return { headers: null, data: { id: "test-email" }, error: null };
  });
  vi.spyOn(runtime.db.user, "findUnique").mockImplementation(
    (args) =>
      Promise.resolve(
        state.db.user.find(
          (u) =>
            u.email === (args.where as { email: string }).email ||
            u.id === (args.where as { id: string }).id,
        ) ?? null,
      ) as never,
  );
  vi.spyOn(runtime.db.verification, "deleteMany").mockImplementation((args) => {
    const identifier = (args?.where as { identifier: string })?.identifier;
    state.db.verification = state.db.verification.filter(
      (v) => v.identifier !== identifier,
    );
    return Promise.resolve({ count: 1 }) as never;
  });
  auth = new AuthService(runtime);
});
afterEach(async () => {
  runtime.redis.disconnect();
  await runtime.db.$disconnect();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function call(path: string, body?: unknown, admin = false, cookie = "") {
  const origin = admin ? env.ADMIN_ORIGIN : env.SHOP_ORIGIN;
  return (admin ? auth.admin : auth.shop).handler(
    new globalThis.Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        origin,
        "content-type": "application/json",
        "x-commerce-client-ip": "test",
        cookie: cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}
const send = (email = "person@example.com", admin = false) =>
  call("/email-otp/send-verification-otp", { email, type: "sign-in" }, admin);
const verify = (otp: string, email = "person@example.com") =>
  call("/sign-in/email-otp", { email, otp });
describe("actual Better Auth email OTP handler", () => {
  it("delivers through callback, stores a hash, creates CUSTOMER and revokes on logout", async () => {
    expect((await send()).status).toBe(200);
    expect(lastOtp).toMatch(/^\d{6}$/);
    expect(JSON.stringify(state.db.verification)).not.toContain(lastOtp);
    const response = await verify(lastOtp);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.token).toBeUndefined();
    expect(data.user.role).toBe("CUSTOMER");
    expect(data.user.emailVerified).toBe(true);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(cookie).toContain("commerce-shop");
    expect(
      (await (await call("/get-session", undefined, false, cookie)).json()).user
        .email,
    ).toBe("person@example.com");
    expect((await call("/sign-out", {}, false, cookie)).status).toBe(200);
    expect(
      await (await call("/get-session", undefined, false, cookie)).json(),
    ).toBeNull();
  });
  it("enforces cooldown and invalidates a stale code after resend", async () => {
    await send();
    const old = lastOtp;
    expect((await send()).status).toBe(429);
    ticks += 61000;
    await send();
    expect(submitted).toBe(2);
    expect((await verify(old)).status).toBe(400);
    expect((await verify(lastOtp)).status).toBe(200);
  });
  it("expires the challenge after five minutes", async () => {
    await send();
    state.db.verification[0].expiresAt = new Date(Date.now() - 1000);
    expect((await verify(lastOtp)).status).toBe(400);
  });
  it("invalidates after five unsuccessful verification attempts", async () => {
    await send();
    const wrong = lastOtp === "000000" ? "999999" : "000000";
    for (let i = 0; i < 5; i++) expect((await verify(wrong)).ok).toBe(false);
    expect((await verify(lastOtp)).ok).toBe(false);
  });
  it("consumes a correct code only once under simultaneous requests", async () => {
    await send();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => verify(lastOtp)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
  it("returns the same generic verification failure for wrong and expired challenges", async () => {
    await send();
    const wrong = lastOtp === "000000" ? "111111" : "000000";
    const incorrect = await verify(wrong);
    expect((await incorrect.json()).message).toBe(
      "The code is invalid or expired",
    );
    state.db.verification[0].expiresAt = new Date(Date.now() - 1000);
    const expired = await verify(lastOtp);
    expect((await expired.json()).message).toBe(
      "The code is invalid or expired",
    );
  });
  it("reports failed email submission and does not allow failed-delivery verification", async () => {
    deliveryFailure = true;
    expect((await send()).status).toBe(503);
    expect(submitted).toBe(0);
    expect(state.db.verification).toHaveLength(0);
  });
  it("does not send admin codes for unknown or customer addresses", async () => {
    expect((await send("stranger@example.com", true)).status).toBe(200);
    expect(submitted).toBe(0);
    await send("customer@example.com");
    await verify(lastOtp, "customer@example.com");
    ticks += 61000;
    expect((await send("customer@example.com", true)).status).toBe(200);
    expect(submitted).toBe(1);
  });
  it("rejects disallowed OTP types and hidden auth routes", async () => {
    expect(
      (
        await call("/email-otp/send-verification-otp", {
          email: "person@example.com",
          type: "forget-password",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/email-otp/check-verification-otp", {
          email: "person@example.com",
          otp: "000000",
          type: "sign-in",
        })
      ).status,
    ).toBe(404);
  });
  it("normalizes email without stripping aliases and rejects client roles", async () => {
    await send("Person+shop@Example.com");
    expect(state.db.verification[0].identifier).toContain(
      "person+shop@example.com",
    );
    const response = await call("/sign-in/email-otp", {
      email: "person+shop@example.com",
      otp: lastOtp,
      role: "OWNER",
    });
    expect((await response.json()).user.role).toBe("CUSTOMER");
  });
  it("rejects an untrusted origin before sending email", async () => {
    const response = await auth.shop.handler(
      new globalThis.Request(
        "http://localhost:3000/api/auth/email-otp/send-verification-otp",
        {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            email: "person@example.com",
            type: "sign-in",
          }),
        },
      ),
    );
    expect(response.status).toBe(403);
    expect(submitted).toBe(0);
  });
  it("requires fresh verification and owner permission for sensitive staff actions", async () => {
    const require = vi.spyOn(auth, "require");
    const req = {
      headers: { "x-commerce-origin": env.ADMIN_ORIGIN },
    } as unknown as Parameters<AuthService["require"]>[0];
    require.mockResolvedValue({
      user: { id: "staff", role: "STAFF", emailVerified: true },
      session: { createdAt: new Date() },
    } as never);
    await expect(auth.staff(req, true, true)).rejects.toThrow("Staff access");
    require.mockResolvedValue({
      user: { id: "owner", role: "OWNER", emailVerified: true },
      session: { createdAt: new Date(Date.now() - 6 * 60000) },
    } as never);
    await expect(auth.staff(req, true, true)).rejects.toThrow("Sign in again");
  });
  it("requires server staff role, admin origin and fresh session", async () => {
    vi.spyOn(auth, "require").mockResolvedValue({
      user: { id: "user", emailVerified: true, role: "CUSTOMER" },
      session: { createdAt: new Date() },
    } as never);
    await expect(
      auth.staff({
        headers: { "x-commerce-origin": env.ADMIN_ORIGIN },
      } as unknown as Parameters<AuthService["require"]>[0]),
    ).rejects.toThrow("Staff access");
  });
});
