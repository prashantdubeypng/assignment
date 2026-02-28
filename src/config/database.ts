// ============================================================
// src/config/database.ts
// Singleton Prisma client with connection lifecycle management.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { env } from './env';

// Prevent multiple instances in development hot-reload
declare global {
    // eslint-disable-next-line no-var
    var __prisma: PrismaClient | undefined;
}

const createPrismaClient = (): PrismaClient => {
    return new PrismaClient({
        log:
            env.NODE_ENV === 'development'
                ? ['query', 'info', 'warn', 'error']
                : ['warn', 'error'],
        errorFormat: 'pretty',
    });
};

export const prisma: PrismaClient =
    global.__prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
    global.__prisma = prisma;
}

export const connectDatabase = async (): Promise<void> => {
    await prisma.$connect();
};

export const disconnectDatabase = async (): Promise<void> => {
    await prisma.$disconnect();
};
