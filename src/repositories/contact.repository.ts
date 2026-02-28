// ============================================================
// src/repositories/contact.repository.ts
//
// Pure data-access layer. No business logic.
// All Prisma queries live here.
//
// Design decisions:
//  - Accepts an optional `tx` (Prisma transaction client) on
//    methods that must participate in the service's transaction.
//  - Uses raw WHERE clauses with OR to avoid N+1 problems.
//  - Soft-delete aware: all reads filter deletedAt IS NULL.
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../config/database';
import {
    Contact,
    CreateContactInput,
    UpdateContactInput,
} from '../models/contact.model';

// Prisma transaction client type
type PrismaTransactionClient = Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface IContactRepository {
    findByEmailOrPhone(
        email: string | null | undefined,
        phoneNumber: string | null | undefined,
        tx?: PrismaTransactionClient,
    ): Promise<Contact[]>;

    findClusterByPrimaryIds(
        primaryIds: number[],
        tx?: PrismaTransactionClient,
    ): Promise<Contact[]>;

    create(
        input: CreateContactInput,
        tx?: PrismaTransactionClient,
    ): Promise<Contact>;

    update(
        id: number,
        input: UpdateContactInput,
        tx?: PrismaTransactionClient,
    ): Promise<Contact>;

    updateManyByLinkedId(
        oldLinkedId: number,
        newLinkedId: number,
        tx?: PrismaTransactionClient,
    ): Promise<void>;

    existsSecondary(
        email: string | null | undefined,
        phoneNumber: string | null | undefined,
        linkedId: number,
        tx?: PrismaTransactionClient,
    ): Promise<boolean>;
}

export class ContactRepository implements IContactRepository {
    constructor(private readonly db: PrismaClient = defaultPrisma) { }

    private client(tx?: PrismaTransactionClient) {
        return tx ? tx.contact : this.db.contact;
    }

    // ----------------------------------------------------------
    // Find all non-deleted contacts matching email OR phone.
    // Used as the entry point for identity graph resolution.
    // ----------------------------------------------------------
    async findByEmailOrPhone(
        email: string | null | undefined,
        phoneNumber: string | null | undefined,
        tx?: PrismaTransactionClient,
    ): Promise<Contact[]> {
        const conditions: Prisma.ContactWhereInput[] = [];

        if (email) conditions.push({ email });
        if (phoneNumber) conditions.push({ phoneNumber });

        if (conditions.length === 0) return [];

        return (await this.client(tx).findMany({
            where: {
                OR: conditions,
                deletedAt: null,
            },
            orderBy: { createdAt: 'asc' },
        })) as Contact[];
    }

    // ----------------------------------------------------------
    // Fetch the entire identity cluster for a set of primary IDs.
    // Returns all primaries + all secondaries linked to them.
    // Single query — avoids N+1.
    // ----------------------------------------------------------
    async findClusterByPrimaryIds(
        primaryIds: number[],
        tx?: PrismaTransactionClient,
    ): Promise<Contact[]> {
        return (await this.client(tx).findMany({
            where: {
                OR: [
                    { id: { in: primaryIds } },
                    { linkedId: { in: primaryIds } },
                ],
                deletedAt: null,
            },
            orderBy: { createdAt: 'asc' },
        })) as Contact[];
    }

    // ----------------------------------------------------------
    // Create a new contact record.
    // ----------------------------------------------------------
    async create(
        input: CreateContactInput,
        tx?: PrismaTransactionClient,
    ): Promise<Contact> {
        return (await this.client(tx).create({
            data: {
                email: input.email ?? null,
                phoneNumber: input.phoneNumber ?? null,
                linkedId: input.linkedId ?? null,
                linkPrecedence: input.linkPrecedence,
            },
        })) as Contact;
    }

    // ----------------------------------------------------------
    // Update a single contact (used for demotion to secondary).
    // ----------------------------------------------------------
    async update(
        id: number,
        input: UpdateContactInput,
        tx?: PrismaTransactionClient,
    ): Promise<Contact> {
        return (await this.client(tx).update({
            where: { id },
            data: {
                ...(input.linkedId !== undefined && { linkedId: input.linkedId }),
                ...(input.linkPrecedence !== undefined && {
                    linkPrecedence: input.linkPrecedence,
                }),
            },
        })) as Contact;
    }

    // ----------------------------------------------------------
    // Bulk-update all secondaries that pointed to `oldLinkedId`
    // to point to `newLinkedId` instead. Called during merges.
    // Single UPDATE WHERE — not N+1.
    // ----------------------------------------------------------
    async updateManyByLinkedId(
        oldLinkedId: number,
        newLinkedId: number,
        tx?: PrismaTransactionClient,
    ): Promise<void> {
        await this.client(tx).updateMany({
            where: { linkedId: oldLinkedId, deletedAt: null },
            data: { linkedId: newLinkedId },
        });
    }

    // ----------------------------------------------------------
    // Check if a secondary already exists with this exact data
    // under the given primary. Used for idempotency guard.
    // ----------------------------------------------------------
    async existsSecondary(
        email: string | null | undefined,
        phoneNumber: string | null | undefined,
        linkedId: number,
        tx?: PrismaTransactionClient,
    ): Promise<boolean> {
        const count = await this.client(tx).count({
            where: {
                email: email ?? null,
                phoneNumber: phoneNumber ?? null,
                linkedId,
                linkPrecedence: 'secondary',
                deletedAt: null,
            },
        });
        return count > 0;
    }
}
