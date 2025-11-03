# Phase 2: Core Features Implementation Plan

**Phase**: 2 - Core Features  
**Timeline**: November 9-20, 2025 (Weeks 3-4)  
**Duration**: 2 weeks  
**Target Completion**: 80% project completion  
**Status**: 🚀 **STARTING NOW**

---

## Overview

Phase 2 builds on Phase 1's security foundation to implement complete business features with full multi-tenant isolation and rate limiting integrated throughout the API.

**Goal**: Transform security infrastructure into operational production features

---

## Phase Objectives

1. ✅ Apply RLS to all database operations
2. ✅ Extend rate limiting to all endpoints
3. ✅ Complete business logic (CRUD operations)
4. ✅ Implement webhook notification system
5. ✅ Standardize API responses
6. ✅ Add comprehensive error handling

---

## Task 2.1: Apply RLS to All Database Operations

**Priority**: 🔴 CRITICAL  
**Effort**: 6-8 hours  
**Complexity**: High

### Objectives
- Wrap all database operations with `withTenantContext`
- Ensure tenant isolation on every query
- Update all API routes
- Add tests for each updated route

### Files to Update

#### Authentication Routes
```
src/app/api/v1/auth/
├── qr-session/
│   ├── generate/route.ts       [UPDATE]
│   ├── scan/route.ts           [UPDATE]
│   └── link/route.ts           [UPDATE]
└── refresh/route.ts            [UPDATE]
```

#### Data Management Routes
```
src/app/api/v1/connection/
├── contacts/
│   ├── route.ts (GET, POST)    [UPDATE]
│   ├── [id]/route.ts (GET, PUT, DELETE) [UPDATE]
│   └── import/route.ts         [NEW]
├── companies/
│   ├── route.ts (GET, POST)    [UPDATE]
│   ├── [id]/route.ts           [UPDATE]
├── leads/
│   ├── route.ts                [UPDATE]
│   ├── [id]/route.ts           [UPDATE]
└── pipelines/
    ├── route.ts                [UPDATE]
    ├── [id]/route.ts           [UPDATE]
```

#### API Management Routes
```
src/app/api/v1/api-keys/
├── route.ts (GET, POST)        [UPDATE]
└── [id]/route.ts (GET, PUT, DELETE) [UPDATE]
```

### Implementation Pattern

```typescript
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { db } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // 1. Authenticate user
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  // 2. Get tenant context
  const tenantContext = getTenantContextFromUser({
    tenantId: user.tenantId,
    role: user.role,
  })
  
  // 3. Execute with tenant isolation
  try {
    const item = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.contact.findUnique({
        where: { id: params.id },
      })
    })
    
    if (!item) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    
    return NextResponse.json(item)
  } catch (error) {
    console.error('Error fetching contact:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

### Routes to Update (15+ endpoints)

1. **QR Session Endpoints** (3)
   - POST `/api/v1/auth/qr-session/generate`
   - POST `/api/v1/auth/qr-session/scan`
   - POST `/api/v1/auth/qr-session/link`

2. **Contact Endpoints** (5)
   - GET `/api/v1/connection/contacts`
   - POST `/api/v1/connection/contacts`
   - GET `/api/v1/connection/contacts/:id`
   - PUT `/api/v1/connection/contacts/:id`
   - DELETE `/api/v1/connection/contacts/:id`

3. **Company Endpoints** (5)
   - GET `/api/v1/connection/companies`
   - POST `/api/v1/connection/companies`
   - GET `/api/v1/connection/companies/:id`
   - PUT `/api/v1/connection/companies/:id`
   - DELETE `/api/v1/connection/companies/:id`

4. **Lead Endpoints** (5)
   - GET `/api/v1/connection/leads`
   - POST `/api/v1/connection/leads`
   - GET `/api/v1/connection/leads/:id`
   - PUT `/api/v1/connection/leads/:id`
   - DELETE `/api/v1/connection/leads/:id`

5. **API Key Endpoints** (5)
   - GET `/api/v1/api-keys`
   - POST `/api/v1/api-keys`
   - GET `/api/v1/api-keys/:id`
   - PUT `/api/v1/api-keys/:id`
   - DELETE `/api/v1/api-keys/:id`

### Testing Strategy
- Write tests for each updated endpoint
- Verify tenant isolation with cross-tenant attempts
- Test error scenarios (404, 403, 401)
- Verify correct responses

### Acceptance Criteria
- [ ] All 20+ endpoints use withTenantContext
- [ ] Zero tenant data leakage possible
- [ ] All endpoints tested
- [ ] 100% test pass rate
- [ ] No performance regression

---

## Task 2.2: Extend Rate Limiting to All Endpoints

**Priority**: 🟡 HIGH  
**Effort**: 4-6 hours  
**Complexity**: Medium

### Objectives
- Apply rate limiting to all sensitive endpoints
- Use appropriate limiter for each endpoint type
- Add rate limit headers to responses
- Monitor rate limit metrics

### Rate Limiter Strategy

```typescript
// Authentication endpoints - Strict
POST /api/auth/demo-login              → loginRateLimiter (5/15min)
POST /api/v1/auth/qr-session/generate  → qrGenerationRateLimiter (10/min)
POST /api/v1/auth/qr-session/scan      → qrGenerationRateLimiter (10/min)

// Data modification endpoints - Moderate
POST /api/v1/connection/contacts       → authenticatedRateLimiter (1000/15min)
PUT /api/v1/connection/contacts/:id    → authenticatedRateLimiter (1000/15min)
DELETE /api/v1/connection/contacts/:id → authenticatedRateLimiter (1000/15min)
[Similar for companies, leads, pipelines]

// API Key endpoints - Moderate
POST /api/v1/api-keys                  → authenticatedRateLimiter (1000/15min)
DELETE /api/v1/api-keys/:id            → authenticatedRateLimiter (1000/15min)

// Read-only endpoints - Lenient
GET /api/v1/connection/contacts        → publicRateLimiter (100/15min)
GET /api/v1/connection/companies       → publicRateLimiter (100/15min)
```

### Implementation Pattern

```typescript
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

export async function POST(request: NextRequest) {
  // Apply rate limiting first
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult
  
  // Continue with business logic
  const user = await getAuthUser(request)
  // ...
}
```

### Endpoints to Update (20+)

- 3 authentication endpoints
- 5 contact endpoints
- 5 company endpoints
- 5 lead endpoints
- 5 API key endpoints
- 5 pipeline/activity endpoints

### Testing Strategy
- Verify rate limit headers present
- Test limit enforcement
- Test different limiter types
- Verify Retry-After header

### Acceptance Criteria
- [ ] All sensitive endpoints have rate limiting
- [ ] Appropriate limiter used per endpoint type
- [ ] Rate limit headers correct
- [ ] Tests verify rate limiting
- [ ] Monitoring in place

---

## Task 2.3: Complete Business Logic

**Priority**: 🔴 CRITICAL  
**Effort**: 10-12 hours  
**Complexity**: High

### Objectives
- Implement full CRUD for all data types
- Add proper validation
- Error handling and messages
- Response standardization

### Features to Implement

#### 1. Contact Management
```typescript
GET    /api/v1/connection/contacts          // List all tenant contacts
POST   /api/v1/connection/contacts          // Create new contact
GET    /api/v1/connection/contacts/:id      // Get contact details
PUT    /api/v1/connection/contacts/:id      // Update contact
DELETE /api/v1/connection/contacts/:id      // Delete contact
POST   /api/v1/connection/contacts/import   // Bulk import
```

**Request/Response**:
```typescript
// Create contact
POST /api/v1/connection/contacts
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "company": "ACME Corp"
}

// Response (201)
{
  "success": true,
  "data": {
    "id": "contact-123",
    "name": "John Doe",
    "email": "john@example.com",
    "tenantId": "tenant-456",
    "createdAt": "2025-11-02T10:00:00Z"
  }
}
```

#### 2. Company Management
```typescript
GET    /api/v1/connection/companies         // List all tenant companies
POST   /api/v1/connection/companies         // Create new company
GET    /api/v1/connection/companies/:id     // Get company details
PUT    /api/v1/connection/companies/:id     // Update company
DELETE /api/v1/connection/companies/:id     // Delete company
```

#### 3. Lead Management
```typescript
GET    /api/v1/connection/leads             // List all tenant leads
POST   /api/v1/connection/leads             // Create new lead
GET    /api/v1/connection/leads/:id         // Get lead details
PUT    /api/v1/connection/leads/:id         // Update lead
DELETE /api/v1/connection/leads/:id         // Delete lead
```

#### 4. Pipeline Management
```typescript
GET    /api/v1/connection/pipelines         // List all tenant pipelines
POST   /api/v1/connection/pipelines         // Create new pipeline
GET    /api/v1/connection/pipelines/:id     // Get pipeline details
PUT    /api/v1/connection/pipelines/:id     // Update pipeline
DELETE /api/v1/connection/pipelines/:id     // Delete pipeline
```

#### 5. Activity Tracking
```typescript
GET    /api/v1/connection/activities        // List activities
POST   /api/v1/connection/activities        // Create activity
GET    /api/v1/connection/activities/:id    // Get activity details
```

### Validation Rules

#### Contact Validation
- Name: Required, 1-100 characters
- Email: Valid email format, optional
- Phone: Valid phone format, optional
- Company: Optional, 1-100 characters

#### Company Validation
- Name: Required, 1-100 characters
- Industry: Optional, predefined list
- Website: Valid URL, optional
- Employees: Number, optional

#### Lead Validation
- Title: Required, 1-100 characters
- Status: Required, one of: new, contacted, qualified, converted, lost
- Value: Optional, number
- Owner: Optional, reference to user

#### Pipeline Validation
- Name: Required, 1-100 characters
- Stages: Array of stage objects
- Each stage: name, displayOrder

### Error Handling

```typescript
// Validation error
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": "Invalid email format"
  }
}

// Not found
{
  "success": false,
  "error": "Contact not found"
}

// Unauthorized
{
  "success": false,
  "error": "Forbidden"
}
```

### Testing Strategy
- Unit tests for each endpoint (CRUD)
- Integration tests for workflows
- Validation tests for all fields
- Tenant isolation tests
- Error scenario tests

### Acceptance Criteria
- [ ] All CRUD operations working
- [ ] Proper validation on all inputs
- [ ] Consistent error responses
- [ ] All tests passing
- [ ] Rate limiting integrated
- [ ] Tenant isolation verified

---

## Task 2.4: Webhook System Implementation

**Priority**: 🟡 HIGH  
**Effort**: 8-10 hours  
**Complexity**: High

### Objectives
- Create webhook event system
- Implement delivery mechanism
- Add retry logic
- Track delivery status

### Webhook Features

#### Event Types
```typescript
// Contact events
'contact.created'
'contact.updated'
'contact.deleted'

// Company events
'company.created'
'company.updated'
'company.deleted'

// Lead events
'lead.created'
'lead.updated'
'lead.deleted'

// Pipeline events
'pipeline.stage.updated'
'lead.moved_to_stage'

// Account events
'tenant.settings.updated'
```

#### Webhook Schema

```typescript
interface Webhook {
  id: string
  tenantId: string
  url: string
  events: string[]
  active: boolean
  secret: string
  createdAt: Date
  updatedAt: Date
}

interface WebhookEvent {
  id: string
  webhookId: string
  event: string
  payload: Record<string, any>
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  nextRetry?: Date
  createdAt: Date
  deliveredAt?: Date
}
```

#### API Endpoints

```typescript
// Create webhook
POST /api/v1/webhooks
{
  "url": "https://example.com/webhook",
  "events": ["contact.created", "contact.updated"]
}

// List webhooks
GET /api/v1/webhooks

// Get webhook details
GET /api/v1/webhooks/:id

// Update webhook
PUT /api/v1/webhooks/:id
{
  "active": true,
  "events": ["contact.created"]
}

// Delete webhook
DELETE /api/v1/webhooks/:id

// List webhook events
GET /api/v1/webhooks/:id/events

// Resend webhook event
POST /api/v1/webhooks/:webhookId/events/:eventId/resend
```

#### Delivery Mechanism

```typescript
// When event occurs
async function triggerWebhookEvent(
  tenantId: string,
  eventType: string,
  payload: any
) {
  const webhooks = await db.webhook.findMany({
    where: {
      tenantId,
      active: true,
      events: { has: eventType }
    }
  })
  
  for (const webhook of webhooks) {
    const event = await db.webhookEvent.create({
      data: {
        webhookId: webhook.id,
        event: eventType,
        payload,
        status: 'pending'
      }
    })
    
    // Queue for delivery
    await queueWebhookDelivery(event.id)
  }
}

// Delivery with retry
async function deliverWebhook(eventId: string) {
  const event = await db.webhookEvent.findUnique({ where: { id: eventId } })
  const webhook = await db.webhook.findUnique({ where: { id: event.webhookId } })
  
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': sign(event.payload, webhook.secret),
        'X-Webhook-Attempt': event.attempts.toString()
      },
      body: JSON.stringify({
        id: event.id,
        event: event.event,
        timestamp: event.createdAt,
        data: event.payload
      }),
      timeout: 30000
    })
    
    if (response.ok) {
      await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'delivered',
          deliveredAt: new Date()
        }
      })
    } else {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch (error) {
    event.attempts++
    
    if (event.attempts < 5) {
      const delay = Math.pow(2, event.attempts) * 60000 // Exponential backoff
      await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'pending',
          attempts: event.attempts,
          nextRetry: new Date(Date.now() + delay)
        }
      })
    } else {
      await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'failed',
          attempts: event.attempts
        }
      })
    }
  }
}
```

#### Retry Strategy
- Attempt 1: Immediately
- Attempt 2: 2 minutes later
- Attempt 3: 4 minutes later
- Attempt 4: 8 minutes later
- Attempt 5: 16 minutes later
- Fail after 5 attempts (30+ minutes)

### Testing Strategy
- Unit tests for webhook CRUD
- Integration tests for delivery
- Mock HTTP endpoint for testing
- Retry logic tests
- Signature verification tests

### Acceptance Criteria
- [ ] Webhook API endpoints working
- [ ] Events triggered correctly
- [ ] Delivery with retry working
- [ ] Retry backoff correct
- [ ] Signature verification working
- [ ] All tests passing

---

## Task 2.5: API Response Standardization

**Priority**: 🟡 MEDIUM  
**Effort**: 4-5 hours  
**Complexity**: Medium

### Objectives
- Standardize all API responses
- Consistent error format
- Consistent success format
- Proper HTTP status codes

### Response Format

#### Success Response
```typescript
{
  "success": true,
  "data": {
    // Response data
  },
  "metadata": {
    "timestamp": "2025-11-02T10:00:00Z",
    "requestId": "req-123"
  }
}
```

#### List Response
```typescript
{
  "success": true,
  "data": [
    // Items
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "pages": 5
  },
  "metadata": {
    "timestamp": "2025-11-02T10:00:00Z"
  }
}
```

#### Error Response
```typescript
{
  "success": false,
  "error": "Error message",
  "code": "VALIDATION_ERROR",
  "details": {
    // Field-level errors
  },
  "metadata": {
    "timestamp": "2025-11-02T10:00:00Z",
    "requestId": "req-123"
  }
}
```

### HTTP Status Codes
- 200: Success
- 201: Created
- 204: No content
- 400: Bad request
- 401: Unauthorized
- 403: Forbidden
- 404: Not found
- 429: Rate limited
- 500: Server error

### Response Helper Functions

```typescript
export function successResponse(data: any, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID()
      }
    },
    { status }
  )
}

export function errorResponse(
  error: string,
  code: string,
  details?: Record<string, any>,
  status = 400
) {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
      details,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID()
      }
    },
    { status }
  )
}
```

### Testing Strategy
- Verify response format on all endpoints
- Check status codes match expected
- Verify metadata fields present
- Error format consistency tests

### Acceptance Criteria
- [ ] All endpoints use standard response format
- [ ] Consistent error format
- [ ] Proper status codes
- [ ] Metadata included
- [ ] Tests verify format

---

## Implementation Timeline

### Week 3 (Nov 9-13)
- **Mon-Tue**: Task 2.1 - Apply RLS to operations (6-8 hours)
- **Wed-Thu**: Task 2.2 - Extend rate limiting (4-6 hours)
- **Fri**: Code review, testing, fixes (4 hours)

### Week 4 (Nov 16-20)
- **Mon-Tue**: Task 2.3 - Complete business logic (10-12 hours)
- **Wed-Thu**: Task 2.4 - Webhook system (8-10 hours)
- **Fri**: Task 2.5 - Response standardization, final testing (4-5 hours)

---

## Dependencies & Prerequisites

### Required from Phase 1
- ✅ RLS migration (not yet deployed to DB)
- ✅ Rate limiting middleware
- ✅ Tenant context system
- ✅ Test utilities

### Tools & Libraries
- ✅ Prisma ORM
- ✅ Vitest for testing
- ✅ Next.js API routes
- ✅ TypeScript strict mode

### Database
- ⏳ RLS migration must be deployed before Phase 2 starts
- Tables already created and indexed
- Connection pooling configured

---

## Success Criteria

### Code Quality
- [ ] 0 TypeScript errors
- [ ] 100% tests passing
- [ ] No security vulnerabilities
- [ ] Clean code review

### Functionality
- [ ] All 20+ endpoints working
- [ ] CRUD operations complete
- [ ] Webhook system operational
- [ ] Rate limiting active

### Testing
- [ ] 50+ new tests created
- [ ] Integration tests passing
- [ ] Error scenarios covered
- [ ] Tenant isolation verified

### Documentation
- [ ] API documentation updated
- [ ] Code examples provided
- [ ] Troubleshooting guide
- [ ] Deployment guide

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| RLS not deployed to DB | 🔴 Critical | Deploy migration before starting Phase 2 |
| Performance degradation | 🟡 High | Monitor query times, add indexes if needed |
| Rate limiting too strict | 🟡 High | Adjust limits based on metrics |
| Webhook delivery failures | 🟡 Medium | Implement retry logic and monitoring |
| Cross-tenant data leak | 🔴 Critical | Extensive testing, code review |

---

## Deliverables

### Code
- 20+ updated API routes with RLS
- 20+ updated API routes with rate limiting
- Webhook system (5+ files, 500+ lines)
- Response helpers and standardization
- 50+ new tests

### Documentation
- Updated API documentation
- Code examples for each endpoint
- Webhook integration guide
- Deployment checklist

### Metrics
- 80% project completion
- 100+ total tests (67 Phase 1 + 50+ Phase 2)
- 10,000+ lines of code (Phase 1 + Phase 2)
- Zero critical security issues

---

## Next Phase Preview

### Phase 3: Advanced Features (Weeks 5-6)
- Audit logging on all operations
- Advanced reporting and analytics
- Email notifications
- Custom field support
- Bulk operations

---

**Ready to begin Phase 2 implementation!** 🚀

