// ============================================================
// src/__tests__/integration/identify.integration.test.ts
//
// Integration tests for POST /api/v1/identify
// Uses supertest against real Express app with all middleware.
// Service is mocked so no live DB is needed.
// ============================================================

import request from 'supertest';
import { Application } from 'express';

// ── Mock database FIRST (before any imports that touch Prisma) ──
jest.mock('../../config/database', () => ({
    prisma: {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
    },
    connectDatabase: jest.fn().mockResolvedValue(undefined),
    disconnectDatabase: jest.fn().mockResolvedValue(undefined),
}));

// ── Mock ContactService using factory so the instance returned
//    by `new ContactService()` inside the controller is also mocked ──
const mockIdentify = jest.fn();

jest.mock('../../services/contact.service', () => {
    return {
        ContactService: jest.fn().mockImplementation(() => ({
            identify: mockIdentify,
        })),
    };
});

// Import app AFTER mocks are registered
import { createApp } from '../../app';

let app: Application;

beforeAll(() => {
    app = createApp();
});

beforeEach(() => {
    mockIdentify.mockReset();
});

afterEach(() => {
    jest.clearAllMocks();
});

const validResponse = {
    contact: {
        primaryContactId: 1,
        emails: ['test@test.com'],
        phoneNumbers: ['1234567890'],
        secondaryContactIds: [],
    },
};

// ===========================================================
// Endpoint: POST /api/v1/identify
// ===========================================================
describe('POST /api/v1/identify', () => {
    // ── Validation ─────────────────────────────────────────
    describe('Request Validation', () => {
        it('returns 400 when both email and phoneNumber are absent', async () => {
            const res = await request(app)
                .post('/api/v1/identify')
                .send({})
                .expect(400);

            expect(res.body.success).toBe(false);
            expect(res.body.message).toBeDefined();
        });

        it('returns 400 for invalid email format', async () => {
            const res = await request(app)
                .post('/api/v1/identify')
                .send({ email: 'not-an-email' })
                .expect(400);

            expect(res.body.success).toBe(false);
        });

        it('returns 400 for empty body', async () => {
            const res = await request(app)
                .post('/api/v1/identify')
                .set('Content-Type', 'application/json')
                .send('{}')
                .expect(400);

            expect(res.body.success).toBe(false);
        });
    });

    // ── Successful requests ────────────────────────────────
    describe('Successful Requests', () => {
        it('returns 200 with email only', async () => {
            mockIdentify.mockResolvedValue(validResponse);

            const res = await request(app)
                .post('/api/v1/identify')
                .send({ email: 'test@test.com' })
                .expect(200);

            expect(res.body).toEqual(validResponse);
            expect(mockIdentify).toHaveBeenCalledWith({
                email: 'test@test.com',
                phoneNumber: null,
            });
        });

        it('returns 200 with phoneNumber only', async () => {
            mockIdentify.mockResolvedValue(validResponse);

            const res = await request(app)
                .post('/api/v1/identify')
                .send({ phoneNumber: '1234567890' })
                .expect(200);

            expect(res.body).toEqual(validResponse);
            expect(mockIdentify).toHaveBeenCalledWith({
                email: null,
                phoneNumber: '1234567890',
            });
        });

        it('returns 200 with both email and phoneNumber', async () => {
            mockIdentify.mockResolvedValue(validResponse);

            const res = await request(app)
                .post('/api/v1/identify')
                .send({ email: 'test@test.com', phoneNumber: '1234567890' })
                .expect(200);

            expect(res.body).toEqual(validResponse);
        });

        it('attaches x-request-id header to response', async () => {
            mockIdentify.mockResolvedValue(validResponse);

            const res = await request(app)
                .post('/api/v1/identify')
                .send({ email: 'test@test.com' })
                .expect(200);

            expect(res.headers['x-request-id']).toBeDefined();
        });

        it('echoes back a provided x-request-id', async () => {
            mockIdentify.mockResolvedValue(validResponse);
            const customId = 'my-custom-request-id-123';

            const res = await request(app)
                .post('/api/v1/identify')
                .set('x-request-id', customId)
                .send({ email: 'test@test.com' })
                .expect(200);

            expect(res.headers['x-request-id']).toBe(customId);
        });
    });

    // ── Error handling ─────────────────────────────────────
    describe('Error Handling', () => {
        it('returns 500 when service throws unexpected error', async () => {
            // Reject with a plain Error (non-operational — maps to 500)
            mockIdentify.mockRejectedValue(new Error('Unexpected DB failure'));

            const res = await request(app)
                .post('/api/v1/identify')
                .send({ email: 'test@test.com' })
                .expect(500);

            expect(res.body.success).toBe(false);
        });
    });

    // ── Health route ───────────────────────────────────────
    describe('GET /api/v1/health', () => {
        it('returns 200 with status ok', async () => {
            const res = await request(app).get('/api/v1/health').expect(200);
            expect(res.body.status).toBe('ok');
        });
    });

    // ── 404 handler ───────────────────────────────────────
    describe('404 Handler', () => {
        it('returns 404 for unknown routes', async () => {
            const res = await request(app).get('/api/v1/unknown-route').expect(404);
            expect(res.body.success).toBe(false);
        });
    });
});
