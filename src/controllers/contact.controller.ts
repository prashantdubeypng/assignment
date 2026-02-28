// ============================================================
// src/controllers/contact.controller.ts
//
// HTTP layer only. No business logic.
// Responsibilities:
//  - Parse & validate incoming request via Zod schema
//  - Delegate to ContactService
//  - Format HTTP response
//  - Use asyncHandler to forward errors to global middleware
// ============================================================

import { Request, Response } from 'express';
import { z } from 'zod';
import { ContactService, IContactService } from '../services/contact.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';

// ── Request validation schema ────────────────────────────────
const IdentifySchema = z
    .object({
        email: z
            .string()
            .email('Invalid email format')
            .nullable()
            .optional(),
        phoneNumber: z
            .string()
            .min(1, 'phoneNumber cannot be empty string')
            .max(20, 'phoneNumber too long')
            .regex(/^\+?[\d\s\-().]+$/, 'Invalid phone number format')
            .nullable()
            .optional(),
    })
    .refine(
        (data) =>
            (data.email !== null && data.email !== undefined) ||
            (data.phoneNumber !== null && data.phoneNumber !== undefined),
        {
            message: 'At least one of email or phoneNumber must be provided.',
        },
    );

export type IdentifyRequestBody = z.infer<typeof IdentifySchema>;

export class ContactController {
    constructor(
        private readonly contactService: IContactService = new ContactService(),
    ) { }

    /**
     * POST /api/v1/identify
     *
     * Reconciles a user identity based on email and/or phone number.
     * Returns the consolidated contact cluster.
     */
    identify = asyncHandler(async (req: Request, res: Response): Promise<void> => {
        const parseResult = IdentifySchema.safeParse(req.body);

        if (!parseResult.success) {
            const details = parseResult.error.errors.map(
                (e) => `${e.path.join('.') || 'body'}: ${e.message}`,
            );
            throw new ValidationError('Request validation failed', details);
        }

        const payload = parseResult.data;

        const result = await this.contactService.identify({
            email: payload.email ?? null,
            phoneNumber: payload.phoneNumber ?? null,
        });

        res.status(200).json(result);
    });
}
