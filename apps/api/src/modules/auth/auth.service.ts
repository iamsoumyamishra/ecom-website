import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { loginEmail } from "@commerce/email";
import { cookieOnly } from "./cookie-only.plugin.js";
import { awaitSubmission } from "./await-submission.plugin.js";
import { Runtime } from "../../common/runtime.js";
import {
  EmailSubmissionError,
  deliveryFailure,
  deliveryMessage,
} from "../notifications/email-delivery.js";
export const AUTH_PATHS = new Set([
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
  "/get-session",
  "/sign-out",
  "/ok",
]);
@Injectable()
export class AuthService {
  readonly shop;
  readonly admin;
  constructor(@Inject(Runtime) readonly runtime: Runtime) {
    this.shop = this.create(false);
    this.admin = this.create(true);
  }
  private create(admin: boolean) {
    const { env, db, email, redis, log } = this.runtime;
    return betterAuth({
      secret: env.BETTER_AUTH_SECRET,
      baseURL: admin ? env.ADMIN_ORIGIN : env.SHOP_ORIGIN,
      basePath: "/api/auth",
      database: prismaAdapter(db, {
        provider: "postgresql",
        transaction: true,
      }),
      trustedOrigins: [env.SHOP_ORIGIN, env.ADMIN_ORIGIN],
      user: {
        additionalFields: {
          role: { type: "string", defaultValue: "CUSTOMER", input: false },
          disabled: { type: "boolean", defaultValue: false, input: false },
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
        cookieCache: { enabled: false },
      },
      advanced: {
        disableOriginCheck: false,
        cookiePrefix: admin ? "commerce-admin" : "commerce-shop",
        useSecureCookies: env.NODE_ENV === "production",
        defaultCookieAttributes: {
          httpOnly: true,
          sameSite: "lax",
          secure: env.NODE_ENV === "production",
        },
        ipAddress: { ipAddressHeaders: ["x-commerce-client-ip"] },
      },
      rateLimit: { enabled: false },
      logger: { disabled: true },
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (!AUTH_PATHS.has(ctx.path))
            throw new APIError("NOT_FOUND", { message: "Not found" });
          if (
            ctx.path === "/email-otp/send-verification-otp" ||
            ctx.path === "/sign-in/email-otp"
          ) {
            const body = ctx.body as { email?: unknown; type?: string };
            if (typeof body.email !== "string")
              throw new APIError("BAD_REQUEST", {
                message: "Enter a valid email",
              });
            const normalized = body.email.trim().toLowerCase();
            if (
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
              normalized.length > 254
            )
              throw new APIError("BAD_REQUEST", {
                message: "Enter a valid email",
              });
            body.email = normalized;
            if (
              ctx.path.includes("send-verification") &&
              body.type !== "sign-in"
            )
              throw new APIError("BAD_REQUEST", { message: "Sign-in only" });
            const hash = createHash("sha256").update(normalized).digest("hex");
            const ipHash = createHash("sha256")
              .update(ctx.headers?.get("x-commerce-client-ip") ?? "unknown")
              .digest("hex");
            const count = (await redis.eval(
              "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
              1,
              `auth-ip:${ipHash}`,
            )) as number;
            const emailCount = (await redis.eval(
              "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],300) end; return n",
              1,
              `auth-email:${hash}`,
            )) as number;
            if (count > 30 || emailCount > 30)
              throw new APIError("TOO_MANY_REQUESTS", {
                message: "Please wait before trying again",
              });
            if (ctx.path.includes("send-verification")) {
              if (
                !(await redis.set(`otp-cooldown:${hash}`, "1", "EX", 60, "NX"))
              )
                throw new APIError("TOO_MANY_REQUESTS", {
                  message: "Wait 60 seconds before requesting another code",
                });
            }
            const user = await db.user.findUnique({
              where: { email: normalized },
            });
            if (
              user?.disabled ||
              (admin && (!user || !["STAFF", "OWNER"].includes(user.role)))
            ) {
              if (ctx.path.includes("send-verification"))
                return ctx.json({ success: true });
              throw new APIError("BAD_REQUEST", {
                message: "The code is invalid or expired",
              });
            }
          }
        }),
      },
      plugins: [
        awaitSubmission,
        cookieOnly,
        emailOTP({
          otpLength: 6,
          expiresIn: 300,
          allowedAttempts: 5,
          storeOTP: "hashed",
          resendStrategy: "rotate",
          disableSignUp: admin,
          sendVerificationOnSignUp: false,
          async sendVerificationOTP({ email: to, otp, type }) {
            if (type !== "sign-in")
              throw new APIError("BAD_REQUEST", { message: "Sign-in only" });
            try {
              if (!email) throw new EmailSubmissionError("NOT_CONFIGURED");
              const content = await loginEmail(
                env.BRAND_NAME,
                otp,
                env.SUPPORT_EMAIL,
              );
              const result = await email.emails.send({
                from: env.EMAIL_FROM,
                to,
                subject: `Your ${env.BRAND_NAME} sign-in code`,
                ...content,
              });
              if (result.error)
                throw new EmailSubmissionError(deliveryFailure(result.error));
            } catch (error) {
              const kind =
                error instanceof EmailSubmissionError ? error.kind : "PROVIDER";
              log.warn(
                { deliveryFailure: kind },
                "OTP email submission failed",
              );
              await db.verification.deleteMany({
                where: { identifier: `sign-in-otp-${to}` },
              });
              throw new APIError("SERVICE_UNAVAILABLE", {
                message: deliveryMessage(kind, env.NODE_ENV === "production"),
              });
            }
          },
        }),
      ],
    });
  }
  forRequest(req: Request) {
    return req.headers["x-commerce-origin"] === this.runtime.env.ADMIN_ORIGIN
      ? this.admin
      : this.shop;
  }
  async session(req: Request) {
    const session = await this.forRequest(req).api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) return null;
    const user = await this.runtime.db.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user || user.disabled) return null;
    return { ...session, user };
  }
  async require(req: Request) {
    const session = await this.session(req);
    if (!session || !session.user.emailVerified)
      throw new UnauthorizedException("Sign in to continue");
    return session;
  }
  async staff(req: Request, owner = false, fresh = false) {
    const session = await this.require(req);
    if (
      req.headers["x-commerce-origin"] !== this.runtime.env.ADMIN_ORIGIN ||
      !(owner ? ["OWNER"] : ["OWNER", "STAFF"]).includes(session.user.role)
    )
      throw new ForbiddenException("Staff access required");
    if (
      fresh &&
      Date.now() - session.session.createdAt.getTime() > 5 * 60 * 1000
    )
      throw new ForbiddenException("Sign in again to verify this action");
    return session;
  }
}
