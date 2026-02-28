// ============================================================
// src/middlewares/errorHandler.middleware.ts
//
// Global Express error handler. Must be the LAST middleware
// registered (4-argument signature).
//
// Handles:
//  - AppError subclasses (operational errors – known status codes)
//  - Prisma errors (proper mapping to HTTP status codes)
//  - Unknown errors (500 fallback, never expose internals)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError, ValidationError, isAppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface ErrorResponse {
    success: false;
    message: string;
    errors?: string[];
    stack?: string;
    requestId?: string;
}

// ── Prisma error → HTTP mapping ──────────────────────────────
const handlePrismaError = (
    error: Prisma.PrismaClientKnownRequestError,
): AppError => {
    switch (error.code) {
        case 'P2002':
            return new AppError('Duplicate field value violates unique constraint', 409);
        case 'P2025':
            return new AppError('Record not found', 404);
        case 'P2003':
            return new AppError('Foreign key constraint failed', 400);
        case 'P2014':
            return new AppError('Relation violation', 400);
        default:
            return new AppError('Database error', 500, false);
    }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const globalErrorHandler = (
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction,
): void => {
    const requestId = res.locals.requestId as string | undefined;

    let appError: AppError;

    if (isAppError(err)) {
        appError = err;
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        appError = handlePrismaError(err);
    } else if (err instanceof Prisma.PrismaClientValidationError) {
        appError = new AppError('Database validation error', 400);
    } else if (err instanceof SyntaxError && 'body' in err) {
        appError = new AppError('Invalid JSON body', 400);
    } else {
        appError = new AppError('Internal server error', 500, false);
    }

    // Log non-operational (programming) errors at error level
    if (!appError.isOperational) {
        logger.error('Unhandled error', {
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            requestId,
            url: req.originalUrl,
            method: req.method,
        });
    } else {
        logger.warn('Operational error', {
            message: appError.message,
            statusCode: appError.statusCode,
            requestId,
        });
    }

    const body: ErrorResponse = {
        success: false,
        message: appError.message,
        ...(requestId && { requestId }),
        ...(appError instanceof ValidationError &&
            appError.details.length > 0 && { errors: appError.details }),
        // Expose stack only in development
        ...(env.NODE_ENV === 'development' && {
            stack: err instanceof Error ? err.stack : undefined,
        }),
    };

    res.status(appError.statusCode).json(body);
};

// ── 404 handler ──────────────────────────────────────────────
export const notFoundHandler = (req: Request, res: Response): void => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
    });
};
