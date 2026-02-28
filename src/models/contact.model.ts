// ============================================================
// src/models/contact.model.ts
// Pure TypeScript interfaces – domain model layer.
// These are NOT Prisma types; they are the application's
// canonical representation of a Contact and its projections.
// ============================================================

export type LinkPrecedence = 'primary' | 'secondary';

// Full domain entity
export interface Contact {
    id: number;
    phoneNumber: string | null;
    email: string | null;
    linkedId: number | null;
    linkPrecedence: LinkPrecedence;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

// Input used by the repository when creating a new contact
export interface CreateContactInput {
    email?: string | null;
    phoneNumber?: string | null;
    linkedId?: number | null;
    linkPrecedence: LinkPrecedence;
}

// Input used when promoting/demoting a contact
export interface UpdateContactInput {
    linkedId?: number | null;
    linkPrecedence?: LinkPrecedence;
}

// DTO returned from the /identify endpoint
export interface IdentifyResponse {
    contact: {
        primaryContactId: number;
        emails: string[];
        phoneNumbers: string[];
        secondaryContactIds: number[];
    };
}

// Internal request payload after validation
export interface IdentifyRequest {
    email?: string | null;
    phoneNumber?: string | null;
}
