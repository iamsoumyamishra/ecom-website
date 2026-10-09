# Validation and provider runbook

## Checks executed in the implementation environment

The supplied runtime was Node 25.9.0 and pnpm 11.7.0; deployment and CI pin Node 24.15.0. Dependencies were installed from the local package cache because outbound registry resolution was unavailable.

| Check                                                     | Result                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Frozen lockfile installation                              | Passed, offline                                                                                      |
| ESLint                                                    | Passed                                                                                               |
| Strict TypeScript, applications/shared packages/test code | Passed                                                                                               |
| Vitest unit and actual Better Auth handler tests          | 28 tests passed                                                                                      |
| Production builds                                         | API bundle and both Next.js applications passed                                                      |
| Prisma schema validation/client generation                | Passed                                                                                               |
| Initial SQL migration                                     | Applied without SQL errors to isolated temporary PostgreSQL in single-user mode                      |
| PostgreSQL commerce integration suite                     | Blocked: socket connection fails with EPERM before test setup; suite failed and all 14 cases skipped |
| Playwright                                                | Six desktop/mobile cases discovered; browser execution blocked by server socket restrictions         |
| Docker images/Compose                                     | Unverified: Docker socket access denied                                                              |
| Resend, Stripe and object storage                         | Unverified: credentials were not supplied; no real delivery/payment/upload attempted                 |

Single-user migration application verifies SQL syntax and constraints, not Prisma transaction concurrency or a running API. The compiled API initialized successfully, then its port bind failed with `listen EPERM 127.0.0.1:4000`. Compiler/build success does not establish visual quality, accessibility conformance or provider acceptance. CI and the commands below must run on an environment with database/Redis/server sockets before deployment. No launch certification is claimed.

## Automated checks on a normal development machine

Follow README startup first, then run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose exec postgres createdb -U commerce commerce_test
TEST_DATABASE_URL=postgresql://commerce:development-only@localhost:5432/commerce_test pnpm test:integration
pnpm exec playwright install chromium webkit
pnpm test:e2e
```

Create the test database only if absent. The integration suite requires a database name ending in `_test`, creates a unique schema, and drops only that schema. It exercises last-unit competition, duplicate keys, provider timeout recovery, client money rejection, unpaid completion, signature verification/durable receipt processing, missed-payment reconciliation, immutable snapshots, fulfillment/stock guards, payment-after-release review, partial refund accounting order ownership, bounded cart updates and clamped one-time guest merging. Provider transports are mocked only in tests; the real PostgreSQL services/transactions are used. API outbox workers are not started by this suite.

Playwright covers catalog/variant/cart/login gates in Chromium desktop and WebKit mobile. Staff publication additionally requires an isolated preverified `E2E_ADMIN_SESSION_COOKIE`; without it the case explicitly skips. Full hosted payment/fulfillment browser automation remains pending. Do not use live account cookies or payment credentials in CI artifacts.

## Controlled provider test run

1. Configure a Resend sender domain with SPF/DKIM and DMARC. Use a controlled mailbox and Stripe **test-mode** credentials. Configure a card-only Stripe payment-method configuration, explicit shipping destinations/rate, and a reviewed tax treatment. Publish approved delivery/returns, privacy and terms text. Configure a test S3 bucket/CDN for upload verification.
2. Start the three applications and run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`. Put the CLI signing secret in the API environment and restart the API. The shop proxy preserves webhook bytes and accepts signed provider requests without a browser Origin header. The API validates the signature.
3. Bootstrap the first owner with `pnpm admin:bootstrap owner@example.com`. Sign in at localhost:3001 using a genuinely delivered OTP. Confirm wrong/expired/stale codes fail, resend waits 60 seconds, logout revokes the session, and a CUSTOMER cannot reach staff operations. Confirm browser JSON never exposes session bearer tokens.
4. Create a draft product with size/color variants, a test upload, and opening inventory. Publish it; verify the next storefront request includes it. Check mobile/desktop image crops, keyboard selection, visible focus, dialog focus handling, empty/error/sold-out states and reduced motion. Record a stock adjustment with a reason and verify its audit/movement records.
5. Add a variant as a guest, verify a customer email, and confirm the guest bag merges. Save/select a delivery address. Start checkout; compare Stripe's EUR total with the order snapshots. Change a catalog price and ensure the existing order remains unchanged. Reject altered currency/amount fields and another user's order ID.
6. Complete a test-card payment on hosted Stripe Checkout. Return redirects may initially show pending; wait for the webhook/reconciler. Verify one payment, one stock sale, one finalized discount allocation and one durable confirmation intent. A duplicate event must not create another sale/email intent. Stop/restart the API between receipt storage and processing to verify recovery.
7. Test invalid webhook signatures, repeated and out-of-order events, missed webhook delivery and Stripe API timeouts. An unpaid completion must stay pending. An expired provider session releases held stock; a paid order never silently loses its allocation. A paid-without-allocation case must enter REVIEW/HOLD with a payment ledger and require operator review.
8. Reverify staff identity immediately before sensitive actions. Ship the paid order with carrier/tracking; verify the shipment and notification intent. Request a partial refund with a stable request key, wait for provider reconciliation, and verify net revenue and remaining refundable amount. Repeat the same request/event and reject an over-refund. Refunds do not restock; record an explicit audited return movement when appropriate.
9. Temporarily make Resend/Redis unavailable after payment: the order stays paid and PostgreSQL notification intent remains recoverable. Restore dependencies and inspect backlog/retries without claiming exactly-once inbox delivery. Test storage rejection for invalid bytes, excessive size, expired tickets and another staff user's ticket.
10. Build/run all three images behind reviewed TLS routing, test readiness, apply a reviewed migration once, and perform an isolated backup restore plus Stripe reconciliation. Configure actual monitoring and failure alerts before accepting live orders.

## Remaining launch work

External credentials, business policies, production DNS/TLS, operational alerts/backups and retention/deletion decisions are required. Expanded gallery/variant editing, browser payment/fulfillment automation, stronger staff MFA, direct storage presigning and mixed-category tax treatment remain follow-up work. Current tax modes and card-only payments must stay within the documented limits. Review dependency overrides and execute CI on the pinned Node version.

MinIO follow-up: Compose configuration and initializer shell syntax pass validation; local storage URLs and production HTTPS boundaries are covered by unit tests. MinIO Docker startup is blocked by Docker socket permissions, so bucket creation and a real upload remain unverified. See [minio.md](minio.md).
