# Clothing Commerce

A pnpm/Turborepo workspace with exactly three applications: the Next.js storefront (`apps/web`), Next.js staff studio (`apps/admin`), and authoritative NestJS API (`apps/api`). The placeholder brand **Forme** is configurable.

Implemented: Better Auth email OTP with Resend delivery, staff authorization and owner bootstrap; published catalog, variants, signed image uploads, audited inventory adjustments; guest/customer carts and transactional merging; server-priced EUR Checkout, conditional stock/discount reservations, durable Stripe receipts, reconciliation, payment ledger, outbox/BullMQ emails; customer orders, staff fulfillment and partial refunds. Missing credentials produce explicit unavailable states, never successful test login/payment responses.

## Local startup

The root [.env.example](.env.example) is a consolidated configuration reference. Applications load the per-app environment files shown below.

Use Node **24.15.0** and pnpm **11.7.0**. Docker must be running, with ports 5432, 6379, 9000 and 9001 available.

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

Replace `BETTER_AUTH_SECRET` and `PROXY_SECRET` with independently generated random values (for example `openssl rand -hex 32`). Set the **same PROXY_SECRET** in the API and both frontends. The example database password is development-only. Set `RESEND_API_KEY` and `EMAIL_FROM` to a verified sender to enable sign-in. Keep secrets in ignored local environment files.

```bash
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm admin:bootstrap owner@example.com
pnpm dev
```

Open the storefront at **http://localhost:3000**, staff studio at **http://localhost:3001**, and Swagger through **http://localhost:3000/api/docs**. The API binds to `127.0.0.1:4000` locally; browser requests always use relative `/api`. Local cookies use distinct shop/admin names, including when both applications share localhost. Production cookies are Secure, HttpOnly, SameSite=Lax and host-only.

Seed data adds example clothing without overwriting existing records or stock. Seed routines refuse production. The first-owner command refuses existing owners and existing email accounts, records an audit entry, and leaves the email unverified until the owner completes OTP sign-in. No real email is sent by automated tests.

## Integration setup

**Email:** provide `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL`, and `BRAND_NAME` in the API. Verify the sender domain, configure Resend's SPF/DKIM records and your DMARC policy, then request a login code with a controlled mailbox. Provider acceptance does not guarantee inbox delivery. Read [authentication setup](docs/authentication.md).

**Payments:** provide Stripe test credentials first: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a `STRIPE_PAYMENT_METHOD_CONFIGURATION` containing **card only**. Prefer a restricted key with Checkout Sessions, PaymentIntents, charges and refunds permissions needed by this API. Configure explicit `SHIPPING_COUNTRIES` (comma-separated ISO codes), `SHIPPING_PRICE_MINOR` (integer EUR cents), and `TAX_POLICY`. Supported tax treatment is `not_collecting` or `included`. For `included`, supply `TAX_RATES_JSON` with explicit country rates in basis points, covering the entire merchandise assortment and delivery. There are no assumed countries or tax rates; special product tax treatment/Stripe Tax requires further implementation and business configuration. Approve and publish delivery, privacy and terms policies before launch.

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Use the signing secret printed by the CLI for local development. Configure the live webhook at `https://shop.your-domain/api/webhooks/stripe`, never the internal API port. Subscribe to `checkout.session.completed`, `checkout.session.expired`, `refund.created`, `refund.updated`, `refund.failed`, and `charge.refunded`. See [checkout and reconciliation](docs/checkout.md).

**Images:** local storage uses MinIO. `pnpm infra:up` builds the pinned MinIO server, starts it on **http://127.0.0.1:9000**, and runs an idempotent initializer for the `commerce-images` bucket. The console is **http://127.0.0.1:9001**. Development credentials are `commerce-storage` / `development-storage-only`, matching the environment templates. The first build downloads the server source and Go dependencies and can take several minutes. Only `products/*` objects permit anonymous reads; anonymous listing, uploads and deletions are not granted. Uploaded product photos therefore work without a separate local CDN.

For an existing installation, copy the `STORAGE_*` values from the updated API template and `NEXT_PUBLIC_CDN_URL` from both frontend templates into your ignored runtime files, then restart all apps. Do not replace existing authentication/payment credentials. If you override Compose's `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` or `STORAGE_BUCKET` through the root `.env`, update API credentials/bucket and both public image URLs to match. See [MinIO setup](docs/minio.md).

For production, configure `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, and `STORAGE_CDN_URL` in the API; set the same CDN origin in each frontend's `NEXT_PUBLIC_CDN_URL`. Staff upload tickets expire in five minutes. The API validates ownership, byte count and image signatures, then writes to S3-compatible storage. Development also permits Unsplash image URLs. Production products must use uploaded images owned by the staff creator. See [deployment](docs/deployment.md).

Frontend variables are `API_INTERNAL_URL`, `SHOP_ORIGIN`, `ADMIN_ORIGIN`, server-only `PROXY_SECRET`, and public `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_SHOP_ORIGIN`, `NEXT_PUBLIC_CDN_URL`. Never add integration credentials to `NEXT_PUBLIC_*`. Every API variable and placeholder is listed in [apps/api/.env.example](apps/api/.env.example).

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The PostgreSQL integration suite requires a separate database whose name ends in `_test`. It creates and removes a unique schema, never truncates the supplied database, and mocks provider network calls only.

```bash
TEST_DATABASE_URL=postgresql://commerce:development-only@localhost:5432/commerce_test pnpm test:integration
```

With all three applications running and development seed fixtures installed:

```bash
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

Admin publication smoke tests additionally require `E2E_ADMIN_SESSION_COOKIE` from an isolated, preverified test staff session. They skip explicitly without it and never send real emails. Automated full hosted-Stripe payment and browser fulfillment tests are not yet implemented; use the manual test-mode runbook in [docs/validation.md](docs/validation.md). CI runs unit, PostgreSQL integration, production build and public browser smoke checks.

For production builds followed by local startup, run `pnpm build`, then `pnpm --filter @commerce/api start`, `pnpm --filter @commerce/web start`, and `pnpm --filter @commerce/admin start` in separate terminals.

## Validation status and launch limits

See [docs/validation.md](docs/validation.md) for checks actually executed. All application type checks and builds, ESLint, and the local unit/handler tests pass. Prisma's generated migration was also applied to a temporary PostgreSQL database using single-user mode. This task environment blocks Docker access and database/browser sockets, so PostgreSQL integration, live API startup, browser execution, Docker images, and real provider flows remain unverified here.

This is an implemented commerce foundation, not a production launch certification. Supply credentials and business policies, run the integration/browser/manual provider checks, and complete operational setup. Remaining scope includes automated full payment/fulfillment browser tests, expanded variant/media editing, editable deployment settings in the admin, stronger staff MFA, multi-category tax treatment, and monitored backup/restore and retention execution. Do not enable delayed payment methods or Stripe Tax without extending their workflows.
