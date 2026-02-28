# ============================================================
# Dockerfile – Multi-stage build
# Fix: prisma generate runs as root in builder stage.
#      Production stage sets proper ownership before user switch.
#      CMD only starts the app — schema is already in Supabase.
# ============================================================

# ── Stage 1: Builder ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first (better layer caching)
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install ALL dependencies (dev included for compilation)
RUN npm ci

# Generate Prisma client AS ROOT (has write permission)
RUN npx prisma generate

# Copy source and compile TypeScript
COPY src ./src
RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy Prisma schema and pre-generated client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001 -G nodejs

# ── Fix: Give nodejs user ownership of everything BEFORE switching ──
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Healthcheck for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# ── Start server only — schema is already applied to Supabase ──
# If you ever need migrations at deploy time, add a deploy hook
# in Render dashboard instead of running them inside the container.
CMD ["node", "dist/index.js"]
