// ============================================================
// src/__tests__/unit/contact.service.test.ts
//
// Unit tests for ContactService.
// All repository interactions are mocked – no DB required.
// ============================================================

import { ContactService } from '../../services/contact.service';
import { createMockRepo, makeContact, resetIdCounter } from '../helpers/mockRepo';
import { PrismaClient } from '@prisma/client';

// Mock the database module — unit tests never touch the DB
jest.mock('../../config/database', () => ({
    prisma: {},
    connectDatabase: jest.fn(),
    disconnectDatabase: jest.fn(),
}));

// ── Mock Prisma transaction ────────────────────────────────
// We mock $transaction to immediately invoke the callback
// with the mock repo client so no real DB is needed.
const mockPrismaTransaction = jest.fn().mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
);

const mockPrisma = {
    $transaction: mockPrismaTransaction,
} as unknown as PrismaClient;

// ── Test setup ─────────────────────────────────────────────
let mockRepo: ReturnType<typeof createMockRepo>;
let service: ContactService;

beforeEach(() => {
    resetIdCounter();
    mockRepo = createMockRepo();
    service = new ContactService(mockRepo, mockPrisma);
});

afterEach(() => {
    jest.clearAllMocks();
});

// ===========================================================
// SCENARIO 1: New contact (no matches)
// ===========================================================
describe('identify – new contact creation', () => {
    it('creates a primary contact when no matches exist', async () => {
        const newContact = makeContact({ id: 1, email: 'lorraine@hillvalley.edu', phoneNumber: '1234567890' });

        mockRepo.findByEmailOrPhone.mockResolvedValue([]);
        mockRepo.create.mockResolvedValue(newContact);

        const result = await service.identify({
            email: 'lorraine@hillvalley.edu',
            phoneNumber: '1234567890',
        });

        expect(mockRepo.create).toHaveBeenCalledWith({
            email: 'lorraine@hillvalley.edu',
            phoneNumber: '1234567890',
            linkedId: null,
            linkPrecedence: 'primary',
        });

        expect(result).toEqual({
            contact: {
                primaryContactId: 1,
                emails: ['lorraine@hillvalley.edu'],
                phoneNumbers: ['1234567890'],
                secondaryContactIds: [],
            },
        });
    });

    it('creates primary with only email provided', async () => {
        const newContact = makeContact({ id: 1, email: 'only@email.com' });

        mockRepo.findByEmailOrPhone.mockResolvedValue([]);
        mockRepo.create.mockResolvedValue(newContact);

        const result = await service.identify({ email: 'only@email.com' });

        expect(result.contact.primaryContactId).toBe(1);
        expect(result.contact.emails).toEqual(['only@email.com']);
        expect(result.contact.phoneNumbers).toEqual([]);
    });

    it('creates primary with only phone provided', async () => {
        const newContact = makeContact({ id: 1, phoneNumber: '9999999999' });

        mockRepo.findByEmailOrPhone.mockResolvedValue([]);
        mockRepo.create.mockResolvedValue(newContact);

        const result = await service.identify({ phoneNumber: '9999999999' });

        expect(result.contact.primaryContactId).toBe(1);
        expect(result.contact.phoneNumbers).toEqual(['9999999999']);
        expect(result.contact.emails).toEqual([]);
    });

    it('throws ValidationError when neither email nor phone provided', async () => {
        await expect(service.identify({})).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining('At least one'),
        });

        expect(mockRepo.findByEmailOrPhone).not.toHaveBeenCalled();
    });
});

// ===========================================================
// SCENARIO 2: Linking secondary to existing primary
// ===========================================================
describe('identify – linking secondary contact', () => {
    it('links new secondary when phone matches primary but email is new', async () => {
        const primary = makeContact({
            id: 1,
            email: 'mcfly@hillvalley.edu',
            phoneNumber: '1234567890',
            linkPrecedence: 'primary',
        });

        const newSecondary = makeContact({
            id: 2,
            email: 'biffsucks@hillvalley.edu',
            phoneNumber: '1234567890',
            linkedId: 1,
            linkPrecedence: 'secondary',
        });

        // First call: direct match
        mockRepo.findByEmailOrPhone.mockResolvedValueOnce([primary]);
        // Inside transaction: same
        mockRepo.findByEmailOrPhone.mockResolvedValueOnce([primary]);
        // Cluster fetch
        mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([primary]);
        // After consolidation
        mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([primary]);
        mockRepo.existsSecondary.mockResolvedValue(false);
        mockRepo.create.mockResolvedValue(newSecondary);
        // Final cluster
        mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([primary, newSecondary]);

        const result = await service.identify({
            email: 'biffsucks@hillvalley.edu',
            phoneNumber: '1234567890',
        });

        expect(mockRepo.create).toHaveBeenCalledWith(
            {
                email: 'biffsucks@hillvalley.edu',
                phoneNumber: '1234567890',
                linkedId: 1,
                linkPrecedence: 'secondary',
            },
            expect.anything(), // tx
        );

        expect(result.contact.primaryContactId).toBe(1);
        expect(result.contact.emails).toContain('mcfly@hillvalley.edu');
        expect(result.contact.emails).toContain('biffsucks@hillvalley.edu');
        expect(result.contact.secondaryContactIds).toContain(2);
    });
});

// ===========================================================
// SCENARIO 3: Merge two primary contacts
// ===========================================================
describe('identify – merging two primary contacts', () => {
    it('demotes newer primary to secondary when two primaries link', async () => {
        const olderPrimary = makeContact({
            id: 1,
            email: 'mcfly@hillvalley.edu',
            phoneNumber: null,
            createdAt: new Date('2024-01-01'),
            linkPrecedence: 'primary',
        });

        const newerPrimary = makeContact({
            id: 2,
            email: null,
            phoneNumber: '9876543210',
            createdAt: new Date('2024-02-01'),
            linkPrecedence: 'primary',
        });

        const demotedNewerPrimary = makeContact({
            ...newerPrimary,
            linkedId: 1,
            linkPrecedence: 'secondary',
        });

        // Initial lookup finds both
        mockRepo.findByEmailOrPhone.mockResolvedValueOnce([olderPrimary, newerPrimary]);
        // Inside transaction
        mockRepo.findByEmailOrPhone.mockResolvedValueOnce([olderPrimary, newerPrimary]);
        // Cluster: both primaries, no secondaries
        mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([olderPrimary, newerPrimary]);
        // After demotion, re-fetch
        mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([olderPrimary, demotedNewerPrimary]);
        mockRepo.existsSecondary.mockResolvedValue(true); // no new info
        // Final cluster
        mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([olderPrimary, demotedNewerPrimary]);

        mockRepo.updateManyByLinkedId.mockResolvedValue(undefined);
        mockRepo.update.mockResolvedValue(demotedNewerPrimary);

        const result = await service.identify({
            email: 'mcfly@hillvalley.edu',
            phoneNumber: '9876543210',
        });

        // Newer primary (id=2) must be demoted
        expect(mockRepo.update).toHaveBeenCalledWith(
            2,
            { linkedId: 1, linkPrecedence: 'secondary' },
            expect.anything(),
        );

        // Older primary (id=1) stays primary
        expect(result.contact.primaryContactId).toBe(1);
        expect(result.contact.secondaryContactIds).toContain(2);
    });
});

// ===========================================================
// SCENARIO 4: Idempotency
// ===========================================================
describe('identify – idempotency', () => {
    it('returns consistent result for identical repeated requests', async () => {
        const primary = makeContact({
            id: 1,
            email: 'repeat@test.com',
            phoneNumber: '1111111111',
            linkPrecedence: 'primary',
        });

        // Both calls route to same primary
        for (let i = 0; i < 2; i++) {
            mockRepo.findByEmailOrPhone.mockResolvedValueOnce([primary]);
            mockRepo.findByEmailOrPhone.mockResolvedValueOnce([primary]);
            mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([primary]);
            mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([primary]);
            mockRepo.existsSecondary.mockResolvedValue(true); // already exists
            mockRepo.findClusterByPrimaryIds.mockResolvedValueOnce([primary]);
        }

        const result1 = await service.identify({
            email: 'repeat@test.com',
            phoneNumber: '1111111111',
        });

        const result2 = await service.identify({
            email: 'repeat@test.com',
            phoneNumber: '1111111111',
        });

        expect(result1).toEqual(result2);
        // Should NOT create extra records
        expect(mockRepo.create).not.toHaveBeenCalled();
    });
});
