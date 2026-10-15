# syntax=docker/dockerfile:1
# Build a partir da raiz do monorepo: docker build -f apps/api/Dockerfile .

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm --filter @traceflow/shared build \
 && pnpm --filter @traceflow/api build \
 && pnpm --filter @traceflow/api deploy --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/v1/health || exit 1
CMD ["node", "dist/main.js"]
