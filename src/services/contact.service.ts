// ============================================================
// src/services/contact.service.ts
//
// Core business logic layer implementing Union-Find-like
// identity graph resolution.
//
// Algorithm overview:
//  1. Query initial contacts matching email OR phone
//  2. Extract all primary IDs from those matches
//  3. Fetch the full cluster (primaries + their secondaries)
//  4. Determine the true primary (oldest createdAt)
//  5. If multiple primaries exist → merge: demote the newer
//     primary to secondary, re-link its children
//  6. If the request carries new information not yet in the
//     cluster → create a new secondary record
//  7. Build and return the consolidated IdentifyResponse
//
// All merge operations run inside a Prisma transaction to
// ensure atomicity. The transaction client is threaded
// through the repository calls.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/database';
import { ContactRepository, IContactRepository } from '../repositories/contact.repository';
import {
    Contact,
    IdentifyRequest,
    IdentifyResponse,
} from '../models/contact.model';
import { logger } from '../utils/logger';
import { ValidationError } from '../utils/errors';

export interface IContactService {
    identify(request: IdentifyRequest): Promise<IdentifyResponse>;
}

export class ContactService implements IContactService {
    constructor(
        private readonly contactRepo: IContactRepository = new ContactRepository(),
        private readonly db: PrismaClient = prisma,
    ) { }

    // ──────────────────────────────────────────────────────────
    // PUBLIC: Main entry point
    // ──────────────────────────────────────────────────────────
    async identify(request: IdentifyRequest): Promise<IdentifyResponse> {
        const { email, phoneNumber } = request;

        if (!email && !phoneNumber) {
            throw new ValidationError(
                'At least one of email or phoneNumber must be provided.',
            );
        }

        logger.debug('Identity resolution started', { email, phoneNumber });

        // STEP 1: Find initial matching contacts
        const initialMatches = await this.contactRepo.findByEmailOrPhone(
            email,
            phoneNumber,
        );

        // STEP 2: Brand new user – create primary and return
        if (initialMatches.length === 0) {
            return this.handleNewContact(email, phoneNumber);
        }

        // STEP 3: Resolve the full cluster inside a transaction
        return this.db.$transaction(async (tx) => {
            // Re-fetch inside transaction for consistency
            const matches = await this.contactRepo.findByEmailOrPhone(
                email,
                phoneNumber,
                tx,
            );

            // Collect all primary IDs touched by this request
            const primaryIds = this.extractPrimaryIds(matches);

            // Fetch the entire identity cluster in one query
            const cluster = await this.contactRepo.findClusterByPrimaryIds(
                primaryIds,
                tx,
            );

            // Determine the canonical primary (oldest createdAt)
            const truePrimary = this.resolveTruePrimary(cluster, primaryIds);

            // Demote any competing primaries and re-link their children
            await this.consolidatePrimaries(cluster, truePrimary, tx);

            // Re-fetch updated cluster after potential merges
            const updatedCluster = await this.contactRepo.findClusterByPrimaryIds(
                [truePrimary.id],
                tx,
            );

            // Create a new secondary if the request has novel information
            await this.createSecondaryIfNewInfo(
                updatedCluster,
                truePrimary,
                email,
                phoneNumber,
                tx,
            );

            // Final cluster state for response building
            const finalCluster = await this.contactRepo.findClusterByPrimaryIds(
                [truePrimary.id],
                tx,
            );

            return this.buildResponse(truePrimary, finalCluster);
        });
    }

    // ──────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ──────────────────────────────────────────────────────────

    /**
     * Handles the case where no existing contact matches.
     * Creates a brand-new primary contact.
     */
    private async handleNewContact(
        email: string | null | undefined,
        phoneNumber: string | null | undefined,
    ): Promise<IdentifyResponse> {
        const newContact = await this.contactRepo.create({
            email: email ?? null,
            phoneNumber: phoneNumber ?? null,
            linkedId: null,
            linkPrecedence: 'primary',
        });

        logger.info('Created new primary contact', { id: newContact.id });

        return this.buildResponse(newContact, [newContact]);
    }

    /**
     * Extracts all primary IDs from a list of contacts.
     * A contact is treated as a primary source if:
     *  - Its linkPrecedence is 'primary' (its own ID is primary)
     *  - Its linkPrecedence is 'secondary' (its linkedId is primary)
     */
    private extractPrimaryIds(contacts: Contact[]): number[] {
        const ids = new Set<number>();
        for (const c of contacts) {
            if (c.linkPrecedence === 'primary') {
                ids.add(c.id);
            } else if (c.linkedId !== null) {
                ids.add(c.linkedId);
            }
        }
        return Array.from(ids);
    }

    /**
     * From the full cluster, finds the oldest contact among the
     * primary nodes – this becomes the canonical primary.
     */
    private resolveTruePrimary(
        cluster: Contact[],
        primaryIds: number[],
    ): Contact {
        const primarySet = new Set(primaryIds);
        const primaries = cluster.filter(
            (c) => c.linkPrecedence === 'primary' && primarySet.has(c.id),
        );

        if (primaries.length === 0) {
            // Fallback: oldest in cluster (should not happen in valid data)
            return cluster[0];
        }

        // Sort ascending by createdAt, pick oldest
        return primaries.sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        )[0];
    }

    /**
     * Demotes any primary contacts (other than truePrimary) to
     * secondary status, and re-links their existing children to
     * point to the true primary instead.
     *
     * All operations run within the caller's transaction.
     */
    private async consolidatePrimaries(
        cluster: Contact[],
        truePrimary: Contact,
        tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    ): Promise<void> {
        const competingPrimaries = cluster.filter(
            (c) => c.linkPrecedence === 'primary' && c.id !== truePrimary.id,
        );

        for (const competing of competingPrimaries) {
            logger.info('Demoting competing primary to secondary', {
                competingId: competing.id,
                truePrimaryId: truePrimary.id,
            });

            // Re-link all of the competing primary's children to truePrimary
            await this.contactRepo.updateManyByLinkedId(
                competing.id,
                truePrimary.id,
                tx,
            );

            // Demote the competing primary itself
            await this.contactRepo.update(
                competing.id,
                { linkedId: truePrimary.id, linkPrecedence: 'secondary' },
                tx,
            );
        }
    }

    /**
     * If the incoming request contains an email OR phone that
     * does not yet exist in the cluster, create a new secondary.
     *
     * Idempotency: skips creation if an identical secondary
     * already exists under this primary.
     */
    private async createSecondaryIfNewInfo(
        cluster: Contact[],
        primary: Contact,
        email: string | null | undefined,
        phoneNumber: string | null | undefined,
        tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    ): Promise<void> {
        const clusterEmails = new Set(
            cluster.map((c) => c.email).filter(Boolean),
        );
        const clusterPhones = new Set(
            cluster.map((c) => c.phoneNumber).filter(Boolean),
        );

        const hasNewEmail = email && !clusterEmails.has(email);
        const hasNewPhone = phoneNumber && !clusterPhones.has(phoneNumber);

        if (!hasNewEmail && !hasNewPhone) {
            logger.debug('No new information – skipping secondary creation');
            return;
        }

        // Idempotency: check if this exact secondary already exists
        const alreadyExists = await this.contactRepo.existsSecondary(
            email,
            phoneNumber,
            primary.id,
            tx,
        );

        if (alreadyExists) {
            logger.debug('Duplicate secondary detected – skipping creation', {
                email,
                phoneNumber,
                primaryId: primary.id,
            });
            return;
        }

        const secondary = await this.contactRepo.create(
            {
                email: email ?? null,
                phoneNumber: phoneNumber ?? null,
                linkedId: primary.id,
                linkPrecedence: 'secondary',
            },
            tx,
        );

        logger.info('Created new secondary contact', {
            id: secondary.id,
            linkedId: primary.id,
        });
    }

    /**
     * Builds the final IdentifyResponse from the cluster.
     * Guarantees:
     *  - Primary's email/phone appear first in their arrays
     *  - No duplicates
     *  - secondaryContactIds excludes the primary
     */
    private buildResponse(
        primary: Contact,
        cluster: Contact[],
    ): IdentifyResponse {
        const secondaries = cluster.filter((c) => c.id !== primary.id);

        // Deduplicate while preserving primary-first order
        const emailSet = new Set<string>();
        const phoneSet = new Set<string>();

        if (primary.email) emailSet.add(primary.email);
        if (primary.phoneNumber) phoneSet.add(primary.phoneNumber);

        for (const contact of secondaries) {
            if (contact.email) emailSet.add(contact.email);
            if (contact.phoneNumber) phoneSet.add(contact.phoneNumber);
        }

        return {
            contact: {
                primaryContactId: primary.id,
                emails: Array.from(emailSet),
                phoneNumbers: Array.from(phoneSet),
                secondaryContactIds: secondaries.map((s) => s.id),
            },
        };
    }
}
