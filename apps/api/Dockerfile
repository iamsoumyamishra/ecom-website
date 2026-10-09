FROM node:24.15.0-bookworm-slim AS builder
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm exec turbo build --filter=@commerce/api...
FROM node:24.15.0-bookworm-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /repo/node_modules ./node_modules
COPY --from=builder --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
