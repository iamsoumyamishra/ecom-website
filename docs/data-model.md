# Data model

The authoritative schema is `packages/database/prisma/schema.prisma`; the initial migration is committed alongside it. Prisma 7 uses its generated `prisma-client` output and PostgreSQL driver adapter. Pool size is bounded to ten connections per API replica, with a five-second connection timeout; the URL's `schema` parameter selects the adapter namespace.

Better Auth models were generated from the installed 1.7.7 `getAuthTables` metadata, preserved in `auth-models.json` and `auth.generated.prisma`. Run `node scripts/generate-auth-schema.mjs` after installing dependencies to regenerate metadata/models for review. Incorporate reviewed changes into the main schema and a new migration; do not overwrite migration history or run migrations on startup.

Commerce models cover addresses, products/variants/images/collections, inventory/movements, guest and customer carts, checkout attempts/reservations, immutable order/item snapshots, payments/refunds/shipments, discounts/redemptions, webhook receipts, durable outbox, media tickets, settings and audit logs. IDs are generated, relations use foreign keys, timestamps are UTC, and list/provider/job lookups are indexed. Auth fields intentionally follow Better Auth's requirements rather than guessed defaults.

Amounts are integer EUR cents and currency is `eur`. Database CHECK constraints enforce positive prices, inventory `0 <= reserved <= onHand`, cart quantity bounds, exactly one cart owner, monetary reconciliation, positive reservations/refunds, supported user roles and discount allocation limits. A partial unique index permits only one CREATING/OPEN attempt per cart. Distinct event and payment identifiers provide independent deduplication layers.

Order addresses and item descriptions/prices/tax/discounts are immutable snapshots. Product edits and profile changes do not rewrite old orders. Tax is included in gross amounts when explicitly configured; total equals subtotal plus delivery minus discount. Item tax reflects the discounted line's included tax; the order tax also includes delivery tax. Tax arithmetic uses BigInt rational rounding to whole cents.

The development seed is insert-only per product slug, uses an advisory lock, never resets stock and refuses production. Seeded composition/photo/content is example merchandise and must be replaced before launch. No staff credentials or verified customer records are seeded.
