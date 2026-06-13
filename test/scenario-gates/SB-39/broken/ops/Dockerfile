FROM oven/bun:1

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile --lockfile bun.lockb

EXPOSE 3000
CMD ["bun", "run", "start"]
