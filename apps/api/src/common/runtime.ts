import { Injectable } from "@nestjs/common";
import { createDatabase } from "@commerce/database";
import { Redis } from "ioredis";
import { Resend } from "resend";
import Stripe from "stripe";
import pino from "pino";
import { loadEnv } from "./config/env.js";
@Injectable()
export class Runtime {
  readonly env = loadEnv();
  readonly db = createDatabase(this.env.DATABASE_URL);
  readonly redis = new Redis(this.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  readonly email = this.env.RESEND_API_KEY
    ? new Resend(this.env.RESEND_API_KEY)
    : null;
  readonly stripe = this.env.STRIPE_SECRET_KEY
    ? new Stripe(this.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 })
    : null;
  readonly log = pino({
    level: "info",
    redact: [
      "req.headers",
      "email",
      "otp",
      "token",
      "body",
      "secret",
      "payload",
    ],
  });
  async onModuleDestroy() {
    await this.db.$disconnect();
    this.redis.disconnect();
  }
}
