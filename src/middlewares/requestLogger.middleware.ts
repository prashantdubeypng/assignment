// ============================================================
// src/middlewares/requestLogger.middleware.ts
//
// Attaches a unique requestId to every request.
// Logs method, URL, status code, and response time.
// The requestId propagates via res.locals for downstream use.
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

declare global {
    namespace Express {
        interface Locals {
            requestId: string;
            requestLogger: ReturnType<typeof logger.child>;
        }
    }
}

export const requestLoggerMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
    const startTime = Date.now();

    // Attach to locals so controllers/services can access it
    res.locals.requestId = requestId;
    res.locals.requestLogger = logger.child({ requestId });

    // Echo the requestId back to the client
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logFn =
            res.statusCode >= 500
                ? 'error'
                : res.statusCode >= 400
                    ? 'warn'
                    : 'info';

        logger[logFn](`${req.method} ${req.originalUrl} ${res.statusCode}`, {
            requestId,
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: duration,
            userAgent: req.headers['user-agent'],
            ip: req.ip,
        });
    });

    next();
};
