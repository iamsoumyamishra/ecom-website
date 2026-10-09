# API contract

Commerce routes use `/api/v1`; Better Auth uses `/api/auth`; Stripe uses `/api/webhooks/stripe`. Swagger is available through the storefront at `/api/docs`, with JSON at `/api/openapi.json`. Request schemas are generated from shared Zod contracts, supplemented with supported auth and raw webhook routes. Browser client types live in `packages/contracts`; Prisma types never cross frontend imports.

| Area                 | Routes                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public catalog       | GET `/products`, `/products/:slug`, `/collections`, `/filters`                                                                                          |
| Public configuration | GET `/checkout-config`, `/policies/:policy`                                                                                                             |
| Cart                 | GET `/cart`, POST `/cart/items`, PATCH/DELETE `/cart/items/:id`, POST `/cart/merge`                                                                     |
| Customer             | GET/PATCH `/me`, GET/POST `/me/addresses`, DELETE `/me/addresses/:id`                                                                                   |
| Checkout             | POST `/checkout`, GET `/checkout/:id`                                                                                                                   |
| Customer orders      | GET `/orders`, `/orders/:id`                                                                                                                            |
| Products             | GET/POST `/admin/products`, GET/PATCH `/admin/products/:id`, POST `/admin/products/:id/publish`                                                         |
| Inventory            | POST `/admin/inventory/:variantId` with integer delta and reason                                                                                        |
| Order operations     | GET `/admin/orders`, POST `/admin/orders/:id/shipments`, POST `/admin/orders/:id/refunds`                                                               |
| Administration       | GET `/admin/overview`, `/customers`, `/settings`, `/audit`; GET/POST `/admin/discounts`, `/admin/collections`, `/admin/staff`; PATCH `/admin/staff/:id` |
| Policies             | PUT `/admin/policies/:policy`                                                                                                                           |
| Media                | POST `/admin/media` (ticket), PUT `/admin/media/:id?signature=...` (bounded raw image)                                                                  |

All table paths above are relative to `/api/v1`. Health paths are `/api/health/live` and `/api/health/ready`; liveness is dependency-independent and readiness checks PostgreSQL/Redis. Health is internal-operation data only and does not expose credentials.

Commerce mutation inputs reject unknown properties and have bounded lengths/quantities. Session and object ownership are checked on the server; guest carts never accept cart IDs from clients. Every admin controller method invokes staff authorization. Owner-only staff/policy mutations and fresh-verification refunds are explicit. Sensitive operations are audited without email bodies, OTPs or session tokens.

Catalog uses ascending stable ID cursors, with `q`, `category`, `collection`, `cursor`, and bounded `limit`. Orders/audit use descending stable ID cursors and bounded pages. Customer/collection/staff/discount views have initial bounded result windows; extended UI pagination remains follow-up work. Responses include `nextCursor` where implemented. Errors use HTTP status, a safe message, and request ID; integration failures never return fake success.

API routes are internal and require a matching proxy secret plus exact trusted origin except health/webhooks. Commerce mutations require original Origin equality. Proxy headers supplied by clients are discarded. Production API ports must remain private even with this header defense. Original auth bodies/raw Stripe bytes are handled outside Nest's JSON parser. Auth logging is suppressed; other request logs record only method, status and request ID.

Saved addresses are limited to 20 per customer, with owner-scoped removal. Checkout can select a saved address but always validates destination and snapshots it independently. Staff access revocation immediately deletes the staff user’s sessions; owner identity and fresh verification are required.
