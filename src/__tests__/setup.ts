// ============================================================
// src/__tests__/setup.ts
// Jest global setup — sets required environment variables
// BEFORE any module imports that validate env on load.
// ============================================================

// Set these before any module is imported
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
    'postgresql://postgres.scujjmpjysldcrjqbxdk:prashant2107pdgg@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true';
process.env.DIRECT_URL =
    'postgresql://postgres.scujjmpjysldcrjqbxdk:prashant2107pdgg@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error';
process.env.RATE_LIMIT_WINDOW_MS = '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
