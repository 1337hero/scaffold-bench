# syntax=docker/dockerfile:1.7

# Builder — install full deps and build the frontend
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY web-ui/package.json web-ui/bun.lock ./web-ui/
RUN bun install --frozen-lockfile
RUN cd web-ui && bun install --frozen-lockfile

COPY . .
RUN cd web-ui && bun run build

# Runner — Bun + bash + node + go for scenario tool execution
FROM oven/bun:1.3-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SCAFFOLD_WEB_PORT=4317
ENV SCAFFOLD_DB_PATH=/app/data/scaffold-bench.db
ENV SHELL=/bin/bash

# Toolchain required by scenarios (missing tools make their scenarios skip, not fail):
#   bash       — the shell scenarios spawn via `setsid $SHELL -lc`
#   nodejs     — behavior tests run with `node`
#   go         — SB-47/SB-48
#   php83      — SB-31..34 (aliased to `php`, which scenario `requires` checks)
#   shellcheck — SB-40
#   cargo      — SB-49/SB-50
RUN apk add --no-cache bash nodejs go php83 shellcheck cargo \
  && ln -sf /usr/bin/php83 /usr/local/bin/php

# Copy deps and built app (devDependencies stay in: the evaluators import
# `typescript` and shell out to `tsc` at scoring time)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/playground ./playground
COPY --from=builder /app/system-prompt.md ./system-prompt.md
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/web-ui/dist ./web-ui/dist

# Volume mount targets — SQLite DB and JSON run reports, kept outside the layered FS
RUN mkdir -p /app/data /app/results
VOLUME /app/data /app/results

EXPOSE 4317

CMD ["bun", "scripts/web.ts"]
