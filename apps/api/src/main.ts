import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import express from "express";
import helmet from "helmet";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { toNodeHandler } from "better-auth/node";
import { addContracts } from "./common/openapi/contracts.js";
import { AppModule } from "./app.module.js";
import { Runtime } from "./common/runtime.js";
import { Errors } from "./common/filters/errors.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { PaymentsService } from "./modules/payments/payments.service.js";
export async function createApp() {
  const server = express();
  server.disable("x-powered-by");
  server.set("trust proxy", false);
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    logger: ["error", "warn"],
  });
  const r = app.get(Runtime);
  const auth = app.get(AuthService);
  const payments = app.get(PaymentsService);
  server.use(helmet());
  server.use((req, res, next) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      if (!req.path.startsWith("/api/auth"))
        r.log.info(
          { requestId, method: req.method, status: res.statusCode },
          "Request completed",
        );
    });
    res.setHeader("Cache-Control", "no-store");
    for (const key of [
      "forwarded",
      "x-forwarded-host",
      "x-forwarded-proto",
      "x-forwarded-for",
    ])
      delete req.headers[key];
    next();
  });
  server.get("/api/health/live", (_req, res) => res.json({ status: "ok" }));
  server.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json", limit: "1mb" }),
    async (req, res) => {
      try {
        res.json(
          await payments.receive(
            req.body,
            req.headers["stripe-signature"] as string,
          ),
        );
      } catch {
        res.status(400).json({ message: "Webhook receipt failed" });
      }
    },
  );
  server.use((req, res, next) => {
    if (req.method === "GET" && req.path === "/api/health/ready") {
      next();
      return;
    }
    const secret = req.headers["x-commerce-proxy"];
    const origin = req.headers["x-commerce-origin"];
    if (
      typeof secret !== "string" ||
      Buffer.byteLength(secret) !== Buffer.byteLength(r.env.PROXY_SECRET) ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(r.env.PROXY_SECRET)) ||
      ![r.env.SHOP_ORIGIN, r.env.ADMIN_ORIGIN].includes(String(origin))
    ) {
      res.status(403).json({ message: "Trusted routing required" });
      return;
    }
    if (
      (req.headers.origin && req.headers.origin !== origin) ||
      (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        req.headers.origin !== origin)
    ) {
      res.status(403).json({ message: "Origin not allowed" });
      return;
    }
    req.headers.host = new URL(String(origin)).host;
    next();
  });
  server.use(async (req, res, next) => {
    if (req.path.startsWith("/api/health")) {
      next();
      return;
    }
    try {
      const ip = String(req.headers["x-commerce-client-ip"] ?? "proxy");
      const count = (await r.redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
        1,
        `api-rate:${ip}`,
      )) as number;
      if (count > 600) {
        res.status(429).json({ message: "Please wait before trying again" });
        return;
      }
      next();
    } catch {
      res.status(503).json({ message: "Shared request limiter unavailable" });
    }
  });
  server.all("/api/auth/*splat", (req, res) => {
    void toNodeHandler(auth.forRequest(req))(req, res);
  });
  server.use(
    "/api/v1/admin/media/:id",
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: "10mb",
    }),
  );
  server.use(express.json({ limit: "128kb" }));
  app.useGlobalFilters(new Errors());
  const config = new DocumentBuilder()
    .setTitle("Clothing Commerce API")
    .setVersion("1")
    .addCookieAuth("commerce-shop.session_token")
    .build();
  const document = addContracts(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup("/api/docs", app, document, {
    jsonDocumentUrl: "/api/openapi.json",
  });
  app.enableShutdownHooks();
  await app.init();
  return app;
}
const app = await createApp();
await app.listen(
  app.get(Runtime).env.PORT,
  app.get(Runtime).env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
);
