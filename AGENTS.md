# Clothing Commerce — Agent Instructions

## Idea and outcome

Build a premium clothing commerce platform with a fast, editorial storefront,
an operational admin panel, and one authoritative API. Use Stripe for payments,
EUR as the only launch currency, PostgreSQL for persistence, and passwordless
email OTP delivered through Resend. Deliver real working commerce flows rather
than visual placeholders. Brand name, logo, market, shipping regions, and tax
policy are configurable; never assume them from example content.

## Architecture

Use a pnpm Turborepo containing exactly three deployable application services:

- `apps/web`: Next.js App Router customer storefront.
- `apps/admin`: Next.js App Router staff interface.
- `apps/api`: NestJS REST API, authentication, integrations, and background jobs.

Use a modular monolith inside the API, not separate commerce microservices.
Both frontends call the API; only the API imports database and secret-bearing
integration packages. PostgreSQL, Redis, and object storage are infrastructure,
not extra application services. Run job consumers inside the API initially;
document a separate worker service only if scale later requires one.

Production routing under a brand-owned parent domain:

- `shop.example.com`: web; `/api/*` reverse-proxies to the API.
- `admin.example.com`: admin; `/api/*` reverse-proxies to the same API.
- Stripe posts to an HTTPS API webhook route exposed through the shop domain.
- Use relative `/api` browser URLs and same-origin cookies on each frontend.
- Each origin has its own host-only session cookie; do not share parent-domain cookies.
- Forward cookies and Set-Cookie correctly through the proxy. Server-side
  Next.js API calls forward the incoming session explicitly and disable caching
  for private data. Validate the original trusted origin; strip spoofed proxy headers.
- Do not make the internal API port publicly accessible except through routing.

## Tech stack

- Workspace: pnpm, Turborepo, TypeScript strict mode; pin compatible versions.
- Frontends: Next.js, React, Tailwind CSS, accessible shadcn/ui primitives.
- Motion: restrained CSS transitions; add Motion only where it improves UX.
- Server state: TanStack Query for interactive customer/admin data.
- Forms: React Hook Form and Zod; use URL state for catalog filters.
- API: NestJS with Express, DTO validation, OpenAPI, structured logging.
- Database: PostgreSQL and Prisma migrations/client.
- Authentication: Better Auth with Prisma adapter and email OTP plugin,
  mounted and initialized only in the API using its supported Express handler.
- Email: Resend Node SDK and React Email templates.
- Payments: Stripe Node SDK and hosted Stripe Checkout at launch.
- Infrastructure: Redis for shared rate limits and BullMQ jobs;
  S3-compatible object storage with CDN for product images.
- Quality: ESLint, formatting, Vitest or Jest, Supertest, Playwright.
- Deployment: separate Docker images for web, admin, API; reverse proxy;
  managed or secured PostgreSQL/Redis, automated backups, CI.

## Repository organization

```text
apps/
  web/src/{app,components,features,lib}
  admin/src/{app,components,features,lib}
  api/src/
    modules/{auth,users,catalog,inventory,carts,checkout,orders}
    modules/{payments,shipping,discounts,media,notifications,admin,audit}
    common/{guards,filters,interceptors,config}
    jobs/
packages/
  ui/                 # Shared primitives and design tokens
  contracts/          # Public DTOs and schemas; no Prisma models or secrets
  api-client/         # Typed client derived from API contracts/OpenAPI
  database/           # Prisma schema, migrations, client; API-only import
  email/              # Templates and server-side email utilities
  eslint-config/
  typescript-config/
docs/
  architecture.md
  data-model.md
  api.md
  authentication.md
  checkout.md
  deployment.md
  decisions.md
```

Keep controllers thin. Put business rules in module services and database
queries in focused repositories where useful. Avoid giant files, duplicate
types, circular imports, and frontend imports of backend implementation.

## Premium design requirements

- Define brand tokens for typography, spacing, color, radii, and motion.
- Use editorial product photography, generous space, strong typography,
  calm neutral surfaces, and one restrained brand accent.
- Build mobile-first layouts with consistent grids and useful image crops.
- Storefront: home, collections, catalog/search, product details, cart,
  login, checkout return, account, orders, order details, and policy pages.
- Product details: gallery, price, size/color selectors, stock status,
  size guide, fabric/care, delivery/returns information, and add-to-cart.
- Admin: overview, products/variants, inventory, orders, customers,
  discounts, collections, brand/shipping settings, and staff management.
- Use reusable page templates and dynamic routes rather than duplicated pages.
- Include loading, empty, error, expired-session, sold-out, and payment-pending states.
- Meet WCAG AA contrast, keyboard navigation, focus visibility, reduced-motion
  preferences, semantic labels, and accessible OTP entry/paste/autofill.
- Optimize responsive images, reserve image dimensions, and lazy-load galleries.
- Use SSR/cache for public catalog data and metadata; invalidate on admin edits.
  Never cache sessions, personalized carts, addresses, or orders publicly.
- Include canonical URLs, product structured data, sitemap, and robots controls;
  prevent admin and private account routes from being indexed.

## Data model

Use generated stable IDs, UTC timestamps, foreign keys, indexes, and constraints.

- Auth models: generate Better Auth's required User, Session, Account, and
  Verification schema with the installed version; do not guess its schema.
- User profile: verified email, optional name, role, disabled status.
- Address: owner, recipient, postal fields, country, optional phone.
- Product: slug, title, description, status, fabric/care, category.
- ProductVariant: product, unique SKU, size, color, priceMinor, currency.
- ProductImage: storage key, alt text, ordering, optional variant association.
- Collection and ProductCollection: curated product membership.
- Inventory: variant, onHand, reserved; available = onHand - reserved.
- InventoryMovement: quantity delta, cause, reference, actor, timestamp.
- Cart and CartItem: owner or opaque guest identifier, variant, quantity.
- CheckoutAttempt: owner/cart, idempotency key, totals, provider session,
  state and reservation expiry; unique provider identifiers.
- InventoryReservation: checkout/order, variant, quantity, release state.
- Order: user, public order number, separate payment/fulfillment states,
  immutable billing/shipping snapshots, totals, currency, checkout reference.
- OrderItem: immutable SKU/title/size/color/unit price/tax/discount snapshots.
- Payment: order, Stripe identifiers, amount, currency, payment state.
- Refund: payment, amount, provider reference, status, reason.
- Shipment: order, carrier, tracking reference, fulfillment timestamps.
- Discount and DiscountRedemption: validity, rules, limits, usage allocations.
- WebhookEvent: unique provider event ID, type, processing state, attempts.
- OutboxEvent: transactional durable job intent with retry and completion state.
- AuditLog: staff actor, action, target, redacted change summary, timestamp.

All amounts use integer euro cents: EUR 49.99 is 4999. Store `eur` internally
and format with Intl.NumberFormat. Never use floating point for money.
Preserve historical order totals when product prices or addresses change.
Index slug/SKU, user orders, order timestamps, session lookups, job state,
and provider IDs. Paginate lists with stable ordering.

## Email OTP authentication with Resend

Implement this flow, not password login or a placeholder OTP:

1. Customer enters email; API normalizes and validates it without unsafe alias stripping.
2. Better Auth generates a cryptographically secure six-digit sign-in OTP.
3. Its `sendVerificationOTP` callback sends a branded email using Resend.
4. Customer submits code; Better Auth verifies and consumes it atomically.
5. First successful customer verification creates a CUSTOMER account; later
   verification signs in the existing account and sets a server-issued session.
6. Frontend refetches session, merges the guest cart, and returns to an approved
   same-origin path. Disallow arbitrary redirect URLs.

Configure five-minute expiry, hashed OTP storage, a maximum of five verification
attempts per challenge, 60-second resend cooldown, and shared IP/email rate
limits. Confirm these options against the pinned Better Auth version.
Resending invalidates the previous code; verification is one-use even under
concurrent requests. Never log OTPs, session tokens, email bodies, or API keys.
Use generic request responses that do not reveal account existence; reject
verification failures without disclosing whether the address is registered.
Handle Resend failures explicitly; never report a successful send when delivery
submission failed. Provider acceptance is not a guarantee of inbox delivery.

Use Resend's server-only key and a verified sender domain. Configure SPF/DKIM
and a DMARC policy. Use HTML and text templates with expiry and support details.
Send a login email only when requested; do not send real emails during tests.

Use Secure, HttpOnly, SameSite cookies, trusted-origin checks and CSRF protection
for mutations. Auth callbacks run in the API, not either Next.js application.
Register exact shop/admin trusted origins. Redact auth routes in logs.
Choose explicit session lifetime and revocation policies; logout revokes sessions.

Admin may use the same email OTP mechanism but requires an existing active staff
role. Never grant staff access through public signup, client claims, or an email
domain match. Restrict admin OTP requests to invited staff without revealing
membership. Gate every admin API operation with session + server-side permission
checks; CUSTOMER sessions are insufficient even if issued on the admin origin.
Bootstrap the first owner using a documented, audited server-side command.
Require fresh verification for role changes/refunds; plan stronger MFA for staff.

## API surface

Use `/api/v1` for commerce, `/api/auth/*` for Better Auth, and a dedicated
`/api/webhooks/stripe` route. Document exact authentication/plugin routes from
the installed version instead of recreating OTP internals.

- Public: products, product by slug, collections, search/filter metadata.
- Cart: read, add/update/remove items, authenticated guest-cart merge.
- Customer: session, profile, addresses, own orders and order details.
- Checkout: create attempt/session, read own checkout status.
- Admin: products/variants/images, inventory movements, orders/shipments,
  refund requests, discounts, settings, staff, and audit history.
- Infrastructure: liveness and dependency readiness endpoints.

Use validated input, bounded quantities, stable pagination, consistent errors,
request IDs, and an OpenAPI contract. Enforce object ownership, authorization,
and idempotency on the server. Guest cart IDs must be unguessable cookies and
must never grant access to customer data. Search uses PostgreSQL initially.

## Purchase and Stripe workflow

1. Customer browses published products and adds specific variants to cart.
2. Guest browsing/cart is allowed; require verified email before checkout.
3. API reloads prices, publication status, stock, discounts, shipping, and tax.
   Ignore client-provided totals. Launch with EUR only; disable adaptive or
   multi-currency pricing. Configure supported destination countries explicitly.
4. In a PostgreSQL transaction, conditionally reserve available variant stock,
   claim limited discounts, create a pending order with snapshots, and create
   a checkout attempt. Lock variants in stable order or use atomic conditional
   updates; reject insufficient stock without partial reservations.
5. Outside the database transaction, create hosted Stripe Checkout with a
   stable Stripe idempotency key and local order/attempt metadata. Persist its
   session ID. Reconcile ambiguous timeouts by retrying the same key, rather
   than creating a second payment session. Compensate confirmed creation failures.
6. Customer completes payment on Stripe. Success/cancel redirects show current
   API status; neither redirect is proof of payment or grounds to release stock.
7. API verifies webhook signatures against raw request bytes. Preserve raw body
   before Nest/Express JSON parsing and use the environment-specific secret.
8. Persist event receipt durably, then process idempotently. Uniqueness applies
   to event IDs and payment/order transitions: different events can describe the
   same payment. Validate provider status, amount, currency, and order reference.
9. On confirmed paid status, transactionally mark payment/order paid, convert
   reserved stock to sold stock, finalize discounts, and create an outbox entry.
   A dispatcher enqueues confirmation email with retries and deduplication.
10. Admin packs and ships; API records tracking and sends shipment updates.

Launch with immediate payment methods only. If delayed methods are later
enabled, handle asynchronous success/failure and retain reservations until a
documented terminal state. A completed Checkout session can still be unpaid.
Handle session expiration, failed payments, refunds, and duplicate/out-of-order
events. A retry job reconciles pending sessions with Stripe after missed events.
Expiration cleanup confirms the provider session is terminal before releasing
stock; a payment racing expiry must not produce a paid order with no allocation.
Unexpected paid-without-stock cases enter manual review, never silent fulfillment.
Webhook acknowledgment means receipt was stored; persist processing state so
an event received before a crash can still be retried.

Refunds use permission checks, idempotent Stripe requests, and provider events
to confirm state. Refunds do not automatically restock merchandise; approved
returns create explicit inventory movements. Support partial refunds accurately.
Configure shipping rates and tax treatment before launch. If Stripe Tax is used,
persist its final totals and reconcile them before confirming payment; do not
hard-code a universal tax percentage or invent tax registrations.

## Admin workflow

- Staff signs in with email OTP; API validates role on every request.
- Create draft product, variants/SKUs, images, stock, and collection assignments.
- Validate publish prerequisites before exposing the product in the storefront.
- Upload images through short-lived signed URLs; validate size/type, finalize
  ownership, and remove abandoned uploads. Never store binary images in Postgres.
- Record stock adjustments with reason and actor; never silently overwrite counts.
- Process paid orders, shipments, cancellations, returns, and refunds through
  explicit valid transitions. Audit sensitive mutations and role changes.
- Revenue reports use confirmed payment/refund records, not pending carts/orders.

## Background jobs and consistency

Use a PostgreSQL outbox for order-related email/job intent, published to BullMQ.
Use stable job IDs, retry with backoff, record failures, and expose operational
alerts. Jobs are at-least-once; handlers must be idempotent. Avoid promising
exactly-once email delivery when provider timeouts make acceptance ambiguous.
Use distributed scheduling/locking for reservation cleanup and reconciliation
when several API replicas run. Redis loss must not erase durable order intent.

## Configuration and operations

Validate environment configuration at startup. Keep secrets out of `NEXT_PUBLIC_*`.
API variables include DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET,
BETTER_AUTH_URL, SHOP_ORIGIN, ADMIN_ORIGIN, RESEND_API_KEY, EMAIL_FROM,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, storage credentials/bucket/CDN URL.
Frontends use the same-origin API path and public brand configuration only.
Hosted Checkout does not require exposing a Stripe secret or card handling.
Provide `.env.example` with placeholders and separate development/staging/live keys.
Pin Node/pnpm, commit the lockfile, configure Turbo outputs and environment inputs.
Never bundle API secrets or private database data into frontend build caches.

Deploy each app independently. Run reviewed Prisma migrations once per release
with a migration job; do not run destructive migrations at application startup.
Use backward-compatible migrations during rolling deployments. Add DB pool
limits, TLS, backups with restore checks, uptime monitoring, error reporting,
webhook/job failure alerts, and structured logs with redacted personal data.
Keep personal data access minimal and define deletion/retention behavior while
preserving required order accounting records. Never store card details locally.

## Implementation workflow

1. Scaffold workspace and three services; configure shared packages and CI.
2. Establish design tokens and responsive storefront/admin shell components.
3. Add Prisma schema, migrations, seed fixtures, and audited owner bootstrap.
4. Implement and test Better Auth email OTP + Resend and role/ownership guards.
5. Build catalog, variants, image uploads, inventory, and admin publishing.
6. Implement guest/customer carts and transactional cart merge.
7. Implement reservations, server-calculated totals, Stripe Checkout/webhooks,
   reconciliation, outbox notifications, and authenticated order status.
8. Implement fulfillment, discounts, partial refunds, and staff audit screens.
9. Complete responsive/accessibility QA, realistic Stripe test flows, deployment,
   migrations, monitoring, and backup/restore documentation.

For each feature, implement API/data rules, UI integration, relevant tests, then
update docs. Never present mocked payment/login flows as working integrations.
Use provider sandboxes and a test mailbox until deployment credentials exist.

## Required validation

- OTP expiry, attempt limit, cooldown, stale-code rejection, one-use concurrency,
  delivery failures, session revocation, and blocked non-staff admin access.
- Product and order ownership; server rejection of client prices/currencies.
- Concurrent checkout against the last unit; duplicate checkout requests;
  Stripe timeout recovery; expiry-versus-payment races.
- Invalid webhook signatures, duplicates, out-of-order events, processing crash
  recovery, unpaid completion, and missed-event reconciliation.
- Payment/refund amount reconciliation and historical order snapshots.
- Resend/job failures must not roll back a confirmed paid order.
- Playwright smoke flow: browse, variant selection, cart, OTP, test checkout,
  order confirmation; staff product publication and fulfillment.
- Run lint, typecheck, focused tests, and production builds for all three apps.

## Agent conduct and documentation

Read existing code and applicable instructions before changing architecture.
Keep scope focused, preserve working behavior, and use small coherent modules.
Do not commit secrets, real OTPs, customer data, or destructive seed routines.
Use current official documentation for installed APIs; record version decisions.
Update relevant `docs/*`, README setup/environment instructions, OpenAPI, and
this file whenever behavior, architecture, workflow, or configuration changes.
Record material tradeoffs in `docs/decisions.md`. Report what changed, checks
run, and remaining limitations. The finished system must support real verified
login, EUR payments, reliable stock accounting, and operational order management.

## Official integration references

- https://better-auth.com/docs/plugins/email-otp
- https://resend.com/docs/send-with-nodejs
- https://resend.com/docs/dashboard/domains/introduction
- https://docs.stripe.com/payments/checkout/how-checkout-works
- https://docs.stripe.com/checkout/fulfillment
- https://docs.stripe.com/webhooks

## Implemented foundation — October 2026

The original specification above remains authoritative. See `docs/implementation.md`
for milestone status, `docs/decisions.md` for version/tradeoff records, and
`docs/validation.md` for checks actually executed and external blockers.

- Run `pnpm db:generate` after dependency installation and before checks.
- Local environment templates live in each app; keep the API/frontends'
  server-only PROXY_SECRET identical. See README for startup commands.
- Auth schema metadata is generated by `scripts/generate-auth-schema.mjs`.
  Review upgrades, particularly the email-submission error plugin and atomic
  verification consumption. Preserve existing reviewed migration history.
- API uses a compiled ESM bundle; Next production builds use Webpack and its
  TypeScript compiler API to work in restricted build environments.
- Tests never send real email. `pnpm test:integration` requires a separate
  TEST_DATABASE_URL ending in `_test`; it creates a generated isolated schema.
- Catalog SSR is currently uncached. Do not add private/public cache behavior
  without updating invalidation, ownership and proxy tests.
- Card-only Stripe configuration, explicit destinations and tax policy/rates
  are required before checkout. Never infer launch tax treatment or countries.

- Local object storage uses MinIO in Compose. Keep the API `STORAGE_*` values and both `NEXT_PUBLIC_CDN_URL` values aligned; see `docs/minio.md`. Allow HTTP/local-IP images only in development and preserve HTTPS requirements in production.
