FROM node:24.15.0-bookworm-slim AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_BRAND_NAME=Forme
ARG NEXT_PUBLIC_SHOP_ORIGIN=https://shop.example.com
ARG NEXT_PUBLIC_CDN_URL=https://cdn.example.com
RUN pnpm exec turbo build --filter=@commerce/web...
FROM node:24.15.0-bookworm-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
