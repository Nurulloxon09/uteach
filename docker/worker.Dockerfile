# uteach worker (bot + outbox sender from M4). Build from the repo root:
#   docker build -f docker/worker.Dockerfile -t uteach-worker .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @uteach/worker build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# The build bundles workspace packages; the worker has no other runtime dependencies yet.
COPY --from=build --chown=node:node /repo/apps/worker/dist ./dist
USER node
CMD ["node", "dist/index.js"]
