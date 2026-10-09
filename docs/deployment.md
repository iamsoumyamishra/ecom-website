# Deployment and operations

Build separate images from repository root:

```bash
docker build -f apps/web/Dockerfile -t commerce-web .
docker build -f apps/admin/Dockerfile -t commerce-admin .
docker build -f apps/api/Dockerfile -t commerce-api .
```

Frontends use standalone Next.js output; API builds a Node ESM bundle plus an audited bootstrap bundle. Images pin Node 24.15.0 and pnpm 11.7.0 and run as the non-root node user. Docker builds were not executable in the task sandbox. Public brand/shop/CDN build arguments must be correct for each environment. Server API URLs/origins/proxy secret are runtime configuration. API integration keys are never frontend build arguments.

Use `ops/nginx.conf.template` as a reviewed routing starting point, substitute its variables securely, and install TLS certificates. Expose only shop/admin TLS endpoints. Web and admin `/api/*` route to the same internal API; Stripe's shop webhook route preserves raw request bytes. API listens on 0.0.0.0 only inside its production container/network. Never publish its port to the internet. Nginx overwrites trusted proxy/origin/client-IP headers and strips forwarded host/protocol/IP headers. Configure trusted CDN ingress separately rather than trusting arbitrary headers. Disable private/auth/body logging and keep request IDs/status monitoring.

Store secrets in the deployment secret manager. Production startup requires exact HTTPS shop/admin origins, random non-placeholder auth/proxy secrets, email/payment configuration, shipping countries and tax policy. Use distinct development/staging/live provider keys and webhook secrets. Configure restricted Stripe permissions and S3 bucket access only for the required prefix; the CDN must serve uploaded product assets without exposing private storage credentials.

Run reviewed Prisma migrations **once per release**, from a full release/build artifact containing the migration files and CLI, with DATABASE_URL supplied by the secret manager. Do not use the local `.env`-loading convenience command inside containers:

```bash
pnpm --filter @commerce/database exec prisma migrate deploy
```

Bootstrap the first production owner using `node apps/api/dist/bootstrap.js owner@example.com` inside the API image with DATABASE_URL injected. Thereafter owner staff management governs invitations/revocation. Never run the development seed in production. Rolling releases require backward-compatible migrations, DB connection headroom across replicas (ten connections each), and a rollback plan for code independently of schema changes.

PostgreSQL needs TLS outside a trusted local network, automated encrypted backups, point-in-time recovery where available, and scheduled restore exercises. Redis should be secured and durable (local Compose uses append-only persistence); Redis loss must trigger queue rebuilding from PostgreSQL's outbox. Monitor liveness/readiness, API errors, Stripe receipt backlog, OPEN/CREATING/REVIEW attempts, pending/failed outbox jobs, uncertain refunds, and oldest unfulfilled orders. Alerts must be configured in the operator's actual monitoring system; this repository does not claim that external alerts or backups are already running.

A restore exercise must restore a backup into isolated infrastructure, verify order/payment totals, inspect reservations/outbox/receipts, and reconcile with Stripe before reopening writes. Avoid replaying customer emails during restore tests. PostgreSQL financial state and provider state must be reconciled, not rolled back independently without review.

Define legal retention/deletion periods before launch. Revoke sessions when disabling accounts; remove expired auth challenges, stale guest carts and abandoned uploads under an approved policy. Preserve required order/payment accounting snapshots and redact unrelated profile data where legally appropriate. Automatic customer-data retention/deletion jobs and provider telemetry dashboards are follow-up work, not existing operational guarantees.

Local MinIO configuration is documented in [minio.md](minio.md). Production MinIO uses reviewed builds, TLS and a dedicated API access policy; the local administrative defaults and public product-image policy are not a complete production storage deployment.
