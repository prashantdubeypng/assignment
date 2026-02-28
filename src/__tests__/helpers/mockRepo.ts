// ============================================================
// src/__tests__/helpers/mockRepo.ts
// Mock implementation of IContactRepository for unit testing.
// ============================================================

import { IContactRepository } from '../../repositories/contact.repository';
import { Contact, CreateContactInput, UpdateContactInput } from '../../models/contact.model';

let idCounter = 1;

export const makeContact = (overrides: Partial<Contact> = {}): Contact => ({
    id: idCounter++,
    email: null,
    phoneNumber: null,
    linkedId: null,
    linkPrecedence: 'primary',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
});

export const resetIdCounter = () => {
    idCounter = 1;
};

export const createMockRepo = (): jest.Mocked<IContactRepository> => ({
    findByEmailOrPhone: jest.fn(),
    findClusterByPrimaryIds: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateManyByLinkedId: jest.fn(),
    existsSecondary: jest.fn(),
});
