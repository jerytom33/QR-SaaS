# CRMFlow API Documentation

## Overview

This document describes the available API endpoints for the CRMFlow enterprise CRM system with QR authentication.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Most endpoints require JWT authentication via the `Authorization` header:

```
Authorization: Bearer <access_token>
```

## Response Format

All API responses follow a standardized format:

### Success Response (2xx)
```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Success message",
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

### Error Response (4xx, 5xx)
```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message",
  "statusCode": 400,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

## Authentication Endpoints

### Demo Login

**Endpoint:** `POST /auth/demo-login`

Authenticates a demo account and returns JWT tokens.

**Request Body:**
```json
{
  "email": "superadmin@demo.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "profile-uuid",
      "email": "superadmin@demo.com",
      "name": "Super Admin",
      "role": "SUPER_ADMIN",
      "tenant": {
        "id": "tenant-uuid",
        "name": "Default Tenant",
        "slug": "default",
        "plan": "ENTERPRISE"
      }
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
  },
  "message": "Login successful",
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

**Errors:**
- `400 Bad Request` - Invalid email format
- `404 Not Found` - Demo account not found
- `500 Internal Server Error` - Server error during authentication

**Demo Accounts:**
```
Super Admin:
  Email: superadmin@demo.com
  Role: SUPER_ADMIN

Tenant Admin (Demo Company):
  Email: admin@demo.com
  Role: TENANT_ADMIN

User (Demo Company):
  Email: user@demo.com
  Role: USER

Tenant Admin (Acme Corp):
  Email: admin@acme-corp.com
  Role: TENANT_ADMIN
```

### Get Demo Accounts

**Endpoint:** `GET /auth/demo-login`

Lists all available demo accounts.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "email": "superadmin@demo.com",
        "name": "Super Admin",
        "role": "SUPER_ADMIN",
        "tenant": {
          "name": "Default Tenant",
          "slug": "default"
        }
      },
      {
        "email": "admin@demo.com",
        "name": "Tenant Admin",
        "role": "TENANT_ADMIN",
        "tenant": {
          "name": "Demo Company",
          "slug": "demo-company"
        }
      }
    ]
  },
  "message": "Demo accounts retrieved successfully",
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

## QR Authentication Endpoints

### Generate QR Session

**Endpoint:** `POST /v1/auth/qr-session/generate`

Creates a new QR authentication session.

**Headers:**
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "deviceInfo": {
    "userAgent": "Mozilla/5.0...",
    "platform": "Web",
    "browser": "Chrome"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "qrSessionId": "session-uuid",
    "status": "PENDING",
    "qrCode": "data:image/png;base64,...",
    "expiresAt": "2025-11-02T12:05:00.000Z",
    "expiresIn": 300
  },
  "message": "QR session created successfully",
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

**Status Codes:**
- `201 Created` - QR session created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid token
- `500 Internal Server Error` - Server error

### Check QR Session Status

**Endpoint:** `GET /v1/auth/qr-session/status/:qrSessionId`

Checks the current status of a QR authentication session.

**Parameters:**
- `qrSessionId` (path) - The ID of the QR session

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "LINKED",
    "linkedToken": "eyJhbGciOiJIUzI1NiIs...",
    "deviceInfo": {
      "userAgent": "Mozilla/5.0...",
      "platform": "Web"
    },
    "expiresAt": "2025-11-02T12:05:00.000Z"
  },
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

**Possible Statuses:**
- `PENDING` - Waiting for device to scan
- `SCANNED` - QR code has been scanned
- `LINKED` - Device linked successfully
- `EXPIRED` - QR session has expired
- `CANCELLED` - User cancelled the linking

**Errors:**
- `404 Not Found` - QR session not found
- `410 Gone` - QR session expired

### Scan QR Code

**Endpoint:** `POST /v1/auth/qr-session/scan`

Marks a QR session as scanned by a device.

**Request Body:**
```json
{
  "qrSessionId": "session-uuid",
  "deviceInfo": {
    "userAgent": "Mozilla/5.0...",
    "platform": "Mobile",
    "browser": "Safari"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "qrSessionId": "session-uuid",
    "status": "SCANNED",
    "confirmationRequired": true
  },
  "message": "QR code scanned successfully",
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

### Link Device to QR Session

**Endpoint:** `POST /v1/auth/qr-session/link`

Completes the device linking process for a QR session.

**Request Body:**
```json
{
  "qrSessionId": "session-uuid",
  "userId": "user-uuid"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "qrSessionId": "session-uuid",
    "status": "LINKED",
    "linkedToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresAt": "2025-11-02T12:05:00.000Z"
  },
  "message": "Device linked successfully",
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

**Errors:**
- `400 Bad Request` - Invalid session or user ID
- `404 Not Found` - QR session or user not found
- `410 Gone` - QR session expired

## Health Check

### Health Status

**Endpoint:** `GET /health`

Simple health check endpoint to verify API availability.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Bad Request | Invalid request format or validation failed |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | User lacks required permissions |
| 404 | Not Found | Resource not found |
| 410 | Gone | Resource has expired |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Service temporarily unavailable |

## Rate Limiting

API requests are rate limited to prevent abuse:

- **Default:** 100 requests per 15 minutes per IP
- **Strict Mode:** 10 requests per 1 minute per IP

Rate limit information is included in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1667384400
```

## Pagination

List endpoints support pagination via query parameters:

```
GET /api/v1/connection/contacts?page=1&pageSize=20
```

**Query Parameters:**
- `page` (default: 1) - Page number
- `pageSize` (default: 10, max: 100) - Items per page

**Paginated Response:**
```json
{
  "success": true,
  "data": {
    "items": [ /* array of items */ ],
    "total": 150,
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  },
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

## Testing with cURL

### Demo Login
```bash
curl -X POST http://localhost:3000/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@demo.com"}'
```

### Generate QR Session
```bash
curl -X POST http://localhost:3000/api/v1/auth/qr-session/generate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Check QR Status
```bash
curl http://localhost:3000/api/v1/auth/qr-session/status/SESSION_ID
```

### Health Check
```bash
curl http://localhost:3000/api/health
```

## Environment Variables

Configuration is managed via environment variables (see `.env` file):

```
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./dev.db
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
```

## Support

For issues or questions:
1. Check the error message and status code
2. Review this documentation
3. Check the server logs for detailed error information
4. Contact the development team
