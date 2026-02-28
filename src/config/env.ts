// ============================================================
// src/config/env.ts
// Centralized, validated environment configuration.
// Fails fast on startup if required vars are missing.
// ============================================================

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
    DIRECT_URL: z.string().url('DIRECT_URL must be a valid connection URL').optional(),
    LOG_LEVEL: z
        .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
        .default('debug'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
    console.error(
        '❌  Invalid environment variables:\n',
        _parsed.error.flatten().fieldErrors,
    );
    process.exit(1);
}

export const env = _parsed.data;
export type Env = typeof env;
