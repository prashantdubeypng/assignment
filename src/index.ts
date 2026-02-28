// ============================================================
// src/index.ts
// Application entry point.
// Handles:
//  - DB connection
//  - Server startup
//  - Graceful shutdown on SIGTERM / SIGINT
// ============================================================

import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';
import { Server } from 'http';

const bootstrap = async (): Promise<Server> => {
    // Connect to database before accepting requests
    await connectDatabase();
    logger.info('✅  Database connected');

    const app = createApp();
    const server = app.listen(env.PORT, () => {
        logger.info(`🚀  Server running`, {
            port: env.PORT,
            environment: env.NODE_ENV,
            docs: `http://localhost:${env.PORT}/api/docs`,
        });
    });

    return server;
};

// ── Graceful shutdown ──────────────────────────────────────
const gracefulShutdown = (server: Server, signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    server.close(async () => {
        logger.info('HTTP server closed');
        await disconnectDatabase();
        logger.info('Database disconnected');
        process.exit(0);
    });

    // Force-kill after 10s if server hasn't closed
    setTimeout(() => {
        logger.error('Could not close connections in time. Forcing exit.');
        process.exit(1);
    }, 10_000).unref();
};

// ── Unhandled rejection / exception guards ─────────────────
process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Promise Rejection', { reason });
    process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

// ── Bootstrap ──────────────────────────────────────────────
bootstrap()
    .then((server) => {
        process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));
    })
    .catch((error: unknown) => {
        logger.error('Failed to start server', {
            error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
    });
