# ---- Builder stage ----
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy workspace root package files
COPY package.json package-lock.json ./

# Copy workspace packages needed for build
COPY packages/shared/ packages/shared/
COPY packages/schema-normalizer/ packages/schema-normalizer/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY tsconfig.json tsconfig.build.json tsup.config.ts ./
COPY src/ src/

# Build shared packages first, then main
RUN cd packages/shared && npm run build 2>/dev/null || true
RUN cd packages/schema-normalizer && npm run build 2>/dev/null || true
RUN npm run build

# Prune: remove dev-only heavy packages from node_modules
RUN rm -rf node_modules/@microsoft node_modules/typescript \
    node_modules/vite node_modules/@babel node_modules/prettier \
    node_modules/@esbuild node_modules/esbuild node_modules/rollup \
    node_modules/@rollup node_modules/@vitest node_modules/vitest \
    node_modules/@types node_modules/eslint* node_modules/@eslint* \
    node_modules/tsup node_modules/@aws-sdk node_modules/@smithy \
    node_modules/es-abstract node_modules/@changesets \
    node_modules/postcss* node_modules/tslib \
    node_modules/@typescript-eslint node_modules/globals \
    node_modules/@swc node_modules/terser node_modules/source-map* \
    node_modules/acorn* node_modules/estree* node_modules/magic-string

# ---- Production stage ----
FROM node:22-alpine AS production

RUN apk add --no-cache libstdc++

RUN addgroup -g 1001 formbridge && \
    adduser -u 1001 -G formbridge -s /bin/sh -D formbridge

WORKDIR /app

COPY --from=builder --chown=formbridge:formbridge /app/node_modules ./node_modules
COPY --from=builder --chown=formbridge:formbridge /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=formbridge:formbridge /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=formbridge:formbridge /app/packages/schema-normalizer/dist ./packages/schema-normalizer/dist
COPY --from=builder --chown=formbridge:formbridge /app/packages/schema-normalizer/package.json ./packages/schema-normalizer/package.json
COPY --from=builder --chown=formbridge:formbridge /app/dist ./dist
COPY --chown=formbridge:formbridge package.json ./

# Create data directory for SQLite
RUN mkdir -p /app/data && chown formbridge:formbridge /app/data

USER formbridge

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
