# MinIO object storage

MinIO is local infrastructure; the three deployable application services remain web, admin and API. Compose includes a persistent MinIO server and a one-shot bucket initializer. The existing S3 SDK uses path-style addressing and uploads through staff-authorized API tickets.

```bash
pnpm infra:up
docker compose logs minio-init
```

API endpoint: `http://127.0.0.1:9000`. Console: `http://127.0.0.1:9001`. Development console/API credentials: `commerce-storage` / `development-storage-only`. The data volume is `minio_data`. Stop with `pnpm infra:down`; do not add `--volumes` unless deliberately deleting local infrastructure data.

Use these entries in `apps/api/.env`:

```dotenv
STORAGE_ENDPOINT=http://127.0.0.1:9000
STORAGE_REGION=us-east-1
STORAGE_BUCKET=commerce-images
STORAGE_ACCESS_KEY_ID=commerce-storage
STORAGE_SECRET_ACCESS_KEY=development-storage-only
STORAGE_CDN_URL=http://127.0.0.1:9000/commerce-images
```

Both `apps/web/.env.local` and `apps/admin/.env.local` use:

```dotenv
NEXT_PUBLIC_CDN_URL=http://127.0.0.1:9000/commerce-images
```

Restart frontends when changing their image configuration. Development image optimization permits this configured local IP and HTTP URL; production disables local-IP fetching and the API requires HTTPS storage/image URLs. A production build should use the real HTTPS CDN configuration.

The initializer creates the bucket only if absent and applies `ops/minio/public-images-policy.json`. Anonymous access permits only `s3:GetObject` on `products/*`; it grants no listing, uploads or deletions. Product photography is public by design. Do not use this prefix for private customer documents. Application uploads still require staff authorization, short-lived tickets, matching bytes/size/type and server-held storage credentials.

Root `.env` can override Compose's `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` and `STORAGE_BUCKET`. These values are not automatically propagated into per-app runtime files; update them consistently. The development API uses the local administrative credentials. Deployments must use dedicated least-privilege API credentials, TLS, secured administrative access, a reviewed build and backups. The Compose loopback endpoints and development credentials are for local use.

MinIO community distribution is source-only, so `ops/minio/Dockerfile` builds the pinned `RELEASE.2025-10-15T17-29-55Z` source rather than relying on an older prebuilt server image. The pinned `mc` image initializes the bucket using its S3-compatible commands. First build requires GitHub/Go module network access. Official references: [MinIO source distribution](https://github.com/minio/minio/blob/master/README.md), [pinned server release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z), [anonymous policies](https://docs.min.io/aistor/reference/cli/mc-anonymous/).

Compose configuration and shell syntax were validated. Docker startup/build/upload verification could not run in the task environment because Docker socket access is denied. On a Docker-capable machine, sign in as staff, upload a valid image in Products → New product, save/publish, and confirm both frontends display its bucket URL. Check that an unauthenticated S3 PUT or bucket listing is denied.
