# syntax=docker/dockerfile:1.7

# Builder — install full deps and build the frontend
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY web-ui/package.json ./web-ui/
RUN bun install --frozen-lockfile
RUN cd web-ui && bun install --frozen-lockfile

COPY . .
RUN cd web-ui && bun run build

# Deps — production-only node_modules for the runtime image
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
  && rm -rf /root/.bun/install/cache

# Runner — Bun + bash + node + go for scenario tool execution
FROM oven/bun:1.3-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SCAFFOLD_WEB_PORT=4317
ENV SCAFFOLD_DB_PATH=/app/data/scaffold-bench.db
ENV SHELL=/bin/bash

# Toolchain required by scenarios:
#   bash    — replaces zsh as the shell scenarios spawn for `setsid <shell> -lc`
#   nodejs  — `node` test commands (sb31 sourcemap, sb33 rename-shorthand, etc.)
#   go      — `go test` for sb24/sb26/sb27 etc.
RUN apk add --no-cache bash nodejs go

# Copy production deps and built app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/playground ./playground
COPY --from=builder /app/system-prompt.md ./system-prompt.md
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/web-ui/dist ./web-ui/dist

# Volume mount target for SQLite — kept outside the layered FS
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 4317

CMD ["bun", "scripts/web.ts"]
