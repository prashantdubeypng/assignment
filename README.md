# Bitespeed Identity Reconciliation API

[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-red)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-5.10-indigo)](https://www.prisma.io)

A **production-ready** REST API that consolidates user identities across purchases using email and phone number reconciliation, as requested by the Bitespeed Backend Task.

---

## 🌐 Hosted Endpoint

```
https://your-app-name.onrender.com/api/v1/identify
```

Swagger UI: `https://your-app-name.onrender.com/api/docs`

---

## 📋 Table of Contents

- [Problem Summary](#-problem-summary)
- [Architecture](#-architecture)
- [Database Schema](#-database-schema)
- [Identity Resolution Algorithm](#-identity-resolution-algorithm)
- [API Reference](#-api-reference)
- [Sample Requests](#-sample-curl-requests)
- [Local Setup](#-local-setup)
- [Testing](#-testing)
- [Deployment](#-deployment-render)
- [Commit Strategy](#-commit-strategy)

---

## 🎯 Problem Summary

When a customer makes a purchase at Bitespeed, they may use different email addresses or phone numbers across transactions. This API identifies that these transactions belong to the same person by:

1. Matching any existing contact by email **OR** phone number
2. Merging separate identity trees when a new transaction links them
3. Always maintaining one canonical **primary** contact (oldest by `createdAt`)
4. Demoting newer primaries to **secondary** contacts when graphs merge
5. Creating new secondary contacts for novel data points

---

## 🏗️ Architecture

The project follows **Clean Architecture** with strict **Separation of Concerns**:

```
src/
├── config/
│   ├── env.ts              # Validated env vars (Zod schema)
│   ├── database.ts         # Singleton Prisma client
│   └── swagger.ts          # OpenAPI 3.0 spec
│
├── models/
│   └── contact.model.ts    # Domain interfaces (no Prisma dependency)
│
├── repositories/
│   └── contact.repository.ts  # ALL DB queries via Prisma
│
├── services/
│   └── contact.service.ts  # Business logic & reconciliation
│
├── controllers/
│   └── contact.controller.ts  # HTTP layer (Zod validation)
│
├── routes/
│   ├── contact.routes.ts   # POST /identify
│   └── health.routes.ts    # GET /health, GET /health/ready
│
├── middlewares/
│   ├── requestLogger.middleware.ts  # UUID requestId + timing
│   └── errorHandler.middleware.ts  # Global error handler
│
├── utils/
│   ├── logger.ts           # Winston structured logger
│   ├── errors.ts           # AppError hierarchy
│   └── asyncHandler.ts     # Async route wrapper
│
├── __tests__/
│   ├── unit/               # Service unit tests (mocked repo)
│   ├── integration/        # HTTP integration tests (supertest)
│   └── helpers/            # Mock factories
│
├── app.ts                  # Express app factory
└── index.ts                # Entry point + graceful shutdown
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| **Controller** | Parse HTTP request, validate via Zod, call service, return response |
| **Service** | Business logic, identity graph resolution, Prisma transaction management |
| **Repository** | All database queries via Prisma — no business logic |
| **Model** | Pure TypeScript interfaces — decoupled from Prisma |
| **Middleware** | Cross-cutting concerns: logging, error handling, security |

---

## 🗄️ Database Schema

```sql
CREATE TABLE contacts (
  id              SERIAL PRIMARY KEY,
  phone_number    VARCHAR,
  email           VARCHAR,
  linked_id       INTEGER REFERENCES contacts(id),
  link_precedence VARCHAR NOT NULL CHECK (link_precedence IN ('primary', 'secondary')),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  deleted_at      TIMESTAMP  -- soft delete
);

-- Performance indexes
CREATE INDEX idx_contacts_email          ON contacts (email);
CREATE INDEX idx_contacts_phone          ON contacts (phone_number);
CREATE INDEX idx_contacts_linked_id      ON contacts (linked_id);
CREATE INDEX idx_contacts_precedence     ON contacts (link_precedence);
CREATE INDEX idx_contacts_email_phone    ON contacts (email, phone_number);
CREATE INDEX idx_contacts_deleted_at     ON contacts (deleted_at);
```

---

## 🧠 Identity Resolution Algorithm

The service implements a **Union-Find–inspired** identity graph resolution:

```
INPUT: { email?, phoneNumber? }

1. FIND: Query contacts WHERE email = ? OR phoneNumber = ?
   └─ If 0 matches → CREATE new PRIMARY → RETURN

2. TRANSACTION BEGIN
   ├─ Re-query inside transaction for consistency
   ├─ Extract all PRIMARY IDs touched by matches
   │   (contact is primary source if linkPrecedence='primary'
   │    OR its linkedId points to another primary)
   │
   ├─ FETCH CLUSTER: Single query fetching all contacts WHERE
   │   id IN (primaryIds) OR linkedId IN (primaryIds)
   │
   ├─ RESOLVE TRUE PRIMARY: Sort primaries by createdAt ASC
   │   → Oldest is the canonical primary
   │
   ├─ MERGE (if needed):
   │   For each competing primary (not truePrimary):
   │   ├─ UPDATE contacts SET linkedId = truePrimary.id WHERE linkedId = competing.id
   │   └─ UPDATE contact SET linkPrecedence='secondary', linkedId=truePrimary.id
   │       WHERE id = competing.id
   │
   ├─ CREATE SECONDARY (if new data):
   │   If email/phone not in cluster emails/phones:
   │   └─ INSERT contact (email, phone, linkedId=truePrimary.id, 'secondary')
   │      [Idempotency guard: skip if exact secondary already exists]
   │
   └─ BUILD RESPONSE: primary's email/phone appear first
3. TRANSACTION COMMIT
4. RETURN consolidated identity
```

### Edge Cases Handled

| Case | Behavior |
|------|----------|
| Only email provided | Matches on email, phone arrays may be empty |
| Only phone provided | Matches on phone, email arrays may be empty |
| Both null | Returns 400 ValidationError |
| Repeated identical request | Idempotent — no duplicate records |
| Two separate identity trees | Merged into one with oldest primary |
| Deeply nested secondaries | Re-linked to true primary in one bulk UPDATE |

---

## 📡 API Reference

### `POST /api/v1/identify`

Reconciles a user identity based on email and/or phone.

**Request Body** (at least one field required):
```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "1234567890"
}
```

**Response** `200 OK`:
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["mcfly@hillvalley.edu", "biffsucks@hillvalley.edu"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": [23]
  }
}
```

**Error Response** `400 Bad Request`:
```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": ["body: At least one of email or phoneNumber must be provided."],
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### `GET /api/v1/health`
Liveness probe. Always returns `200` if the process is alive.

### `GET /api/v1/health/ready`
Readiness probe. Returns `200` if DB is reachable, `503` otherwise.

### `GET /api/docs`
Swagger UI for interactive API documentation.

---

## 📦 Sample cURL Requests

### New contact (both email + phone)
```bash
curl -X POST https://your-app.onrender.com/api/v1/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu", "phoneNumber": "1234567890"}'
```

### Email only
```bash
curl -X POST https://your-app.onrender.com/api/v1/identify \
  -H "Content-Type: application/json" \
  -d '{"email": "mcfly@hillvalley.edu"}'
```

### Phone only
```bash
curl -X POST https://your-app.onrender.com/api/v1/identify \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "1234567890"}'
```

### Trigger a merge (two separate identities linked by new request)
```bash
# Step 1: Create identity A
curl -X POST .../identify -d '{"email": "a@test.com"}'

# Step 2: Create identity B
curl -X POST .../identify -d '{"phoneNumber": "9999999999"}'

# Step 3: Merge A and B (request bridges both identities)
curl -X POST .../identify -d '{"email": "a@test.com", "phoneNumber": "9999999999"}'
```

---

## 🚀 Local Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- npm 10+

### Steps

```bash
# 1. Clone and install
git clone https://github.com/your-org/bitespeed-identity.git
cd bitespeed-identity
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set your DATABASE_URL

# 3. Run Prisma migrations
npx prisma migrate dev --name init

# 4. Generate Prisma client
npx prisma generate

# 5. Start development server
npm run dev
```

Server will be available at `http://localhost:3000`
Swagger docs at `http://localhost:3000/api/docs`

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Matrix

| Test | Type | Coverage |
|------|------|----------|
| New contact creation | Unit | ✅ |
| Email-only request | Unit | ✅ |
| Phone-only request | Unit | ✅ |
| Link new secondary | Unit | ✅ |
| Merge two primaries | Unit | ✅ |
| Idempotent repeated requests | Unit | ✅ |
| HTTP validation (400s) | Integration | ✅ |
| requestId propagation | Integration | ✅ |
| Error handling (500) | Integration | ✅ |
| Health endpoints | Integration | ✅ |

---

## 🐳 Docker

```bash
# Build image
docker build -t bitespeed-identity .

# Run with environment variables
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e NODE_ENV=production \
  bitespeed-identity
```

---

## 🚀 Deployment (Render)

### Option A: One-click via render.yaml (recommended)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New** → **Blueprint**
3. Connect your repository
4. Render will read `render.yaml` and provision the web service + PostgreSQL automatically

### Option B: Manual

1. Create a **PostgreSQL** database on Render
2. Create a new **Web Service** with:
   - **Build Command**: `npm ci && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && node dist/index.js`
3. Add environment variables from `.env.example`
4. Set `DATABASE_URL` from the provisioned Render PostgreSQL

---

## 💡 Commit Strategy

```
feat: scaffold project with TypeScript, Express, Prisma
feat: add Contact model and Prisma schema with indexes
feat: implement ContactRepository with transaction support
feat: implement identity reconciliation in ContactService
feat: add ContactController with Zod validation
feat: wire up routes, middleware, and Express app
feat: add Swagger/OpenAPI documentation
feat: add graceful shutdown and health endpoints
test: add unit tests for ContactService scenarios
test: add integration tests for /identify endpoint
chore: add Dockerfile with multi-stage build
chore: add render.yaml for one-click deployment
docs: write comprehensive README
```
