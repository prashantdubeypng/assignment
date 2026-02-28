// ============================================================
// src/utils/logger.ts
// Structured Winston logger with context support.
// Outputs JSON in production, colorized text in development.
// ============================================================

import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

// Custom dev format: [timestamp] LEVEL: message {meta}
const devFormat = printf(({ level, message, timestamp: ts, requestId, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts}${rid} ${level}: ${message}${metaStr}`;
});

const prodFormat = combine(
    timestamp(),
    errors({ stack: true }),
    json(),
);

const devConsoleFormat = combine(
    colorize({ all: true }),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    devFormat,
);

export const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    defaultMeta: { service: 'bitespeed-identity' },
    transports: [
        new winston.transports.Console({
            format: env.NODE_ENV === 'production' ? prodFormat : devConsoleFormat,
        }),
    ],
    // In production you'd also add a file transport or a log aggregator transport
    exitOnError: false,
});

/**
 * Creates a child logger scoped to a requestId.
 * Use this inside request handlers for traced logging.
 */
export const createRequestLogger = (requestId: string): winston.Logger => {
    return logger.child({ requestId });
};
