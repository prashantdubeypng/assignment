// ============================================================
// src/utils/errors.ts
// Centralized application error hierarchy.
// All thrown errors from service/repository layer extend
// AppError so the global error handler can classify them.
// ============================================================

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        // Maintains proper stack trace for where error was thrown (Node.js only)
        Error.captureStackTrace(this, this.constructor);
    }
}

// ── HTTP 400 ────────────────────────────────────────────────
export class ValidationError extends AppError {
    public readonly details: string[];

    constructor(message: string, details: string[] = []) {
        super(message, 400);
        this.details = details;
    }
}

// ── HTTP 404 ────────────────────────────────────────────────
export class NotFoundError extends AppError {
    constructor(resource: string) {
        super(`${resource} not found`, 404);
    }
}

// ── HTTP 409 ────────────────────────────────────────────────
export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409);
    }
}

// ── HTTP 422 ────────────────────────────────────────────────
export class UnprocessableError extends AppError {
    constructor(message: string) {
        super(message, 422);
    }
}

// ── HTTP 500 ────────────────────────────────────────────────
export class InternalError extends AppError {
    constructor(message = 'Internal server error') {
        super(message, 500, false);
    }
}

// ── Type guard ──────────────────────────────────────────────
export const isAppError = (error: unknown): error is AppError => {
    return error instanceof AppError;
};
