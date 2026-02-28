// ============================================================
// src/utils/asyncHandler.ts
// Wraps async Express route handlers so unhandled promise
// rejections are automatically forwarded to next(err).
// ============================================================

import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncFn = (
    req: Request,
    res: Response,
    next: NextFunction,
) => Promise<void>;

export const asyncHandler =
    (fn: AsyncFn): RequestHandler =>
        (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
