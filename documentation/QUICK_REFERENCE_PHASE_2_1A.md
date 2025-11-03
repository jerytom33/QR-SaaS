# Quick Reference: Phase 2.1a Implementation

## ✅ What's Complete

**Contacts API** - Full CRUD with multi-tenant isolation, JWT auth, rate limiting

### Files Delivered
- `src/app/api/v1/connection/contacts/route.ts` (460+ lines) - GET, POST, PUT, DELETE
- `src/app/api/v1/connection/contacts/[id]/route.ts` (240+ lines) - GET, PUT, DELETE (dynamic)
- `src/lib/middleware/__tests__/contacts.test.ts` (550+ lines) - 32+ tests

## 🔒 Security Pattern

```typescript
// 1. Rate Limit (FIRST!)
const rateLimitResult = await authenticatedRateLimiter(request)
if (rateLimitResult) return rateLimitResult

// 2. Authenticate
const user = await getAuthUser(request)
if (!user) return NextResponse.json({...}, {status: 401})

// 3. Tenant Context
const tenantContext = getTenantContextFromUser({
  tenantId: user.tenantId,
  role: user.role
})

// 4. RLS Wrap (ALL DB OPS!)
const result = await withTenantContext(db, tenantContext, async (tx) => {
  return await tx.contact.findMany({...})
})
```

## 📋 HTTP Endpoints

### GET /api/v1/connection/contacts
- Lists contacts with pagination & search
- Returns: Array of contacts + pagination info
- Status: 401 (auth), 500 (error)

### POST /api/v1/connection/contacts
- Creates new contact
- Validates required fields (firstName, lastName)
- Returns: Created contact
- Status: 400 (validation), 409 (duplicate), 401 (auth), 201 (created)

### GET /api/v1/connection/contacts/[id]
- Retrieves single contact
- Returns: Contact object
- Status: 401 (auth), 404 (not found)

### PUT /api/v1/connection/contacts/[id]
- Updates contact (partial updates OK)
- Validates field types
- Returns: Updated contact
- Status: 400 (validation), 401 (auth), 404 (not found)

### DELETE /api/v1/connection/contacts/[id]
- Deletes contact
- Returns: Success message
- Status: 401 (auth), 404 (not found)

## 🧪 Key Tests

| Test | Verifies |
|------|----------|
| Cross-tenant READ | Contact from tenant2 invisible to tenant1 |
| Cross-tenant WRITE | Tenant2 cannot update tenant1's contact |
| Cross-tenant DELETE | Tenant2 cannot delete tenant1's contact |
| Duplicate email | Same email rejected in same tenant |
| Dup different tenant | Same email allowed in different tenant |
| Rate limiting | Per-user limits enforced |
| Validation | Required fields rejected when missing |
| Auth required | 401 returned when no Bearer token |
| Partial update | Only provided fields updated |

## 📝 Request Format

```
Authorization: Bearer {token}
x-user-id: {userId}
x-tenant-id: {tenantId}
x-user-role: SUPER_ADMIN|TENANT_ADMIN|USER
Content-Type: application/json

POST body example:
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "title": "Manager",
  "notes": "VIP",
  "tags": ["important"],
  "customFields": {"industry": "tech"},
  "company": "company-id"
}
```

## 📊 Response Format

```json
{
  "success": true,
  "data": { /* resource */ },
  "metadata": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "requestId": "uuid-here"
  }
}

// Error response
{
  "success": false,
  "error": "Validation failed",
  "issues": [
    {"path": "email", "message": "Invalid email"}
  ]
}
```

## 🔄 Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | GET/PUT successful |
| 201 | Created | POST successful |
| 400 | Bad Request | Validation failed |
| 401 | Unauthorized | Missing auth |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate email |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Unexpected error |

## ✅ Validation Rules

**Required**:
- firstName (string, min 1 char)
- lastName (string, min 1 char)

**Optional**:
- email (valid email format)
- phone (any string)
- title (any string)
- notes (any string)
- tags (array of strings)
- customFields (object with string keys)
- company (string = company ID)

## 🚀 Next Routes (Same Pattern)

1. Companies (`/companies`)
2. Leads (`/leads`)
3. Pipelines (`/pipelines`)
4. API Keys (`/api-keys`)
5. QR Sessions (`/qr-sessions`)
6. Activities (`/activities`)
7-12. ... (9 more routes)

**Template**: See `PHASE_2_IMPLEMENTATION_TEMPLATE.md`

## 📁 File Locations

```
Code:
- Main handler: src/app/api/v1/connection/contacts/route.ts
- Dynamic handler: src/app/api/v1/connection/contacts/[id]/route.ts
- Tests: src/lib/middleware/__tests__/contacts.test.ts

Docs:
- Completion report: PHASE_2_1A_COMPLETE.md
- Implementation template: PHASE_2_IMPLEMENTATION_TEMPLATE.md
- Progress checkpoint: PHASE_2_1A_CHECKPOINT.md
- Final delivery: PHASE_2_1A_FINAL_DELIVERY.md
```

## 🔧 Common Issues & Fixes

**Issue**: "Cannot find name 'validateApiKey'"  
**Fix**: Remove all `validateApiKey()` calls, use `getAuthUser()` instead

**Issue**: TypeScript error "Cannot read property 'issues'"  
**Fix**: Check `validation.success` first, then use `validation.data` or `validation.error.issues`

**Issue**: Tenant data leaking between accounts  
**Fix**: Verify ALL db operations wrapped in `withTenantContext`. Check for direct `db.` calls.

**Issue**: Tests failing with "Contact not found"  
**Fix**: Ensure tenant IDs match in test setup and requests

**Issue**: Rate limiting not working  
**Fix**: Verify `authenticatedRateLimiter` is called FIRST before auth check

## 🎯 Success Checklist

For implementing new routes:
- [ ] Create main route handler (route.ts)
- [ ] Create dynamic route handler ([id]/route.ts)
- [ ] Add rate limiting check (first line)
- [ ] Add JWT authentication
- [ ] Wrap all DB ops in withTenantContext
- [ ] Add Zod validation schema
- [ ] Create test file with 30+ tests
- [ ] Verify 0 TypeScript errors
- [ ] Verify 100% test pass rate
- [ ] Verify multi-tenant isolation tests pass

## 📞 Support Resources

- **Code Reference**: See `contacts/route.ts` for exact pattern
- **Test Reference**: See `contacts.test.ts` for test patterns
- **Template**: See `PHASE_2_IMPLEMENTATION_TEMPLATE.md` for copy-paste code
- **Questions**: Check `PHASE_2_1A_COMPLETE.md` for detailed docs

---

**Status**: ✅ Phase 2.1a Complete | Ready for Phase 2.1b  
**Pattern**: Reusable for 12 remaining routes  
**Quality**: Production-ready, 32+ tests, 0 errors
