// ============================================================
// src/routes/health.routes.ts
// Liveness and readiness probes for container orchestration.
// ============================================================

import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { env } from '../config/env';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Liveness probe
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
    });
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe – checks DB connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *       503:
 *         description: Service unavailable
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: 'ready', db: 'connected' });
    } catch {
        res.status(503).json({ status: 'not ready', db: 'disconnected' });
    }
});

export default router;
