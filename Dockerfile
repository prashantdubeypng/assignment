# ============================================================
# Dockerfile – Multi-stage build
#
# Fix for Render (Alpine Linux 3.17+):
#   Alpine dropped OpenSSL 1.1 – Prisma needs openssl installed
#   explicitly. We also set binaryTargets in schema.prisma to
#   linux-musl-openssl-3.0.x so the right engine is bundled.
# ============================================================

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-alpine AS builder

# Install OpenSSL (needed by Prisma engine at build & runtime)
RUN apk add --no-cache openssl openssl-dev

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install all deps (dev included for compilation)
RUN npm ci

# Generate Prisma client with correct binary targets
RUN npx prisma generate

# Copy source and compile TypeScript
COPY src ./src
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-alpine AS production

# Install OpenSSL so the Prisma query engine .node file can load
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy pre-generated Prisma client from builder (with correct binary)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001 -G nodejs

# Give nodejs user ownership of the entire app directory
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Schema already applied to Supabase — just start the server
CMD ["node", "dist/index.js"]
