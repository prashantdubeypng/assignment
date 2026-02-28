# ============================================================
# Dockerfile
# Multi-stage build for minimal production image.
#
# Stage 1 (builder): Installs all deps, compiles TypeScript
# Stage 2 (production): Copies only the compiled output and
#   production node_modules for a lean final image.
# ============================================================

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first (better layer caching)
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDeps for compilation)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile
COPY src ./src
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy Prisma schema and generated client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

USER nodejs

EXPOSE 3000

# Healthcheck for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
