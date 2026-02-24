# ── Stage 1: Install dependencies ─────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build TypeScript + Tailwind CSS ──────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY src ./src
COPY public ./public
COPY tsconfig.json ./
COPY tailwind.config.js ./

RUN pnpm run build

# ── Stage 3: Production runner ───────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=deps /app/package.json ./

USER appuser
EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4200/health || exit 1

CMD ["node", "dist/index.js"]
