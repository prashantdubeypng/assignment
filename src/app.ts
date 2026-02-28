// ============================================================
// src/app.ts
// Express application factory.
// Separated from index.ts so tests can import the app
// without starting a server or connecting to the DB.
// ============================================================

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { requestLoggerMiddleware } from './middlewares/requestLogger.middleware';
import {
    globalErrorHandler,
    notFoundHandler,
} from './middlewares/errorHandler.middleware';
import contactRoutes from './routes/contact.routes';
import healthRoutes from './routes/health.routes';

export const createApp = (): Application => {
    const app = express();

    // ── Security headers ───────────────────────────────────────
    app.use(
        helmet({
            contentSecurityPolicy: env.NODE_ENV === 'production',
        }),
    );

    // ── CORS ───────────────────────────────────────────────────
    app.use(
        cors({
            origin:
                env.NODE_ENV === 'production'
                    ? ['https://your-frontend.example.com']
                    : '*',
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type', 'x-request-id'],
        }),
    );

    // ── Compression ────────────────────────────────────────────
    app.use(compression());

    // ── Body parsing ───────────────────────────────────────────
    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: true, limit: '10kb' }));

    // ── Rate limiting ──────────────────────────────────────────
    const limiter = rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        max: env.RATE_LIMIT_MAX_REQUESTS,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
            success: false,
            message: 'Too many requests, please try again later.',
        },
    });
    app.use('/api/', limiter);

    // ── Request logging ────────────────────────────────────────
    app.use(requestLoggerMiddleware);

    // ── Trust proxy (required for rate limiting behind Render/Nginx)
    app.set('trust proxy', 1);

    // ── Swagger UI ─────────────────────────────────────────────
    app.use(
        '/api/docs',
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec, {
            customSiteTitle: 'Bitespeed API Docs',
            swaggerOptions: { persistAuthorization: true },
        }),
    );

    // ── Routes ─────────────────────────────────────────────────
    app.use('/api/v1', healthRoutes);
    app.use('/api/v1', contactRoutes);

    // ── 404 handler ────────────────────────────────────────────
    app.use(notFoundHandler);

    // ── Global error handler (must be last) ───────────────────
    app.use(globalErrorHandler);

    return app;
};
