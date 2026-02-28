// ============================================================
// src/config/swagger.ts
// OpenAPI 3.0 specification for Swagger UI integration.
// ============================================================

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Bitespeed Identity Reconciliation API',
            version: '1.0.0',
            description:
                'A production-ready REST API that consolidates user identities across purchases using email and phone number reconciliation.',
            contact: {
                name: 'Bitespeed Backend',
                url: 'https://bitespeed.co',
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT',
            },
        },
        servers: [
            {
                url: '/api/v1',
                description: 'API v1',
            },
        ],
        components: {
            schemas: {
                IdentifyRequest: {
                    type: 'object',
                    properties: {
                        email: {
                            type: 'string',
                            format: 'email',
                            nullable: true,
                            example: 'mcfly@hillvalley.edu',
                        },
                        phoneNumber: {
                            type: 'string',
                            nullable: true,
                            example: '1234567890',
                        },
                    },
                    description:
                        'At least one of email or phoneNumber must be provided.',
                },
                IdentifyResponse: {
                    type: 'object',
                    properties: {
                        contact: {
                            type: 'object',
                            properties: {
                                primaryContactId: { type: 'integer', example: 1 },
                                emails: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    example: ['mcfly@hillvalley.edu', 'biffsucks@hillvalley.edu'],
                                },
                                phoneNumbers: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    example: ['1234567890'],
                                },
                                secondaryContactIds: {
                                    type: 'array',
                                    items: { type: 'integer' },
                                    example: [23],
                                },
                            },
                        },
                    },
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Validation failed' },
                        errors: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    },
    apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
