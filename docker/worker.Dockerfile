# uteach worker (bot + outbox sender, M4). Build from the repo root:
#   docker build -f docker/worker.Dockerfile -t uteach-worker .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
# Bundles the workspace packages into apps/worker/dist and copies the receipt fonts to apps/worker/fonts.
RUN pnpm --filter @uteach/worker build
# Keep only production dependencies (grammY, postgres, @react-pdf/renderer, …) for the runtime.
RUN pnpm install --offline --frozen-lockfile --prod --filter @uteach/worker...

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
COPY --from=build --chown=node:node /repo /repo
WORKDIR /repo/apps/worker
USER node
# Settings come from the environment: WORKER_DATABASE_URL, TELEGRAM_BOT_TOKEN, SMS_PROVIDER, ESKIZ_* (apps/worker/.env.example).
CMD ["node", "dist/index.js"]
