/**
 * Unit Tests: Request Validation Middleware
 * Tests for input validation and schema parsing
 *
 * Phase 1.3: Unit Testing Framework Setup
 * Date: November 3, 2025
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  validateQueryParams,
  CommonSchemas,
  DemoLoginSchema,
  QRSessionGenerateSchema,
  ContactSchema,
} from '@/lib/middleware/validation';

describe('Validation Middleware', () => {
  describe('validateQueryParams()', () => {
    it('should validate pagination parameters', () => {
      const params = { page: '1', pageSize: '10' };
      const result = validateQueryParams(params, CommonSchemas.pagination);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(10);
      }
    });

    it('should reject invalid page number', () => {
      const params = { page: '0', pageSize: '10' };
      const result = validateQueryParams(params, CommonSchemas.pagination);

      expect(result.valid).toBe(false);
    });

    it('should reject page size exceeding maximum', () => {
      const params = { page: '1', pageSize: '200' };
      const result = validateQueryParams(params, CommonSchemas.pagination);

      expect(result.valid).toBe(false);
    });

    it('should apply default values for pagination', () => {
      const params = {};
      const result = validateQueryParams(params, CommonSchemas.pagination);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(10);
      }
    });

    it('should validate email schema', () => {
      const schema = z.object({ email: CommonSchemas.email });
      const params = { email: 'test@example.com' };
      const result = validateQueryParams(params, schema);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid email', () => {
      const schema = z.object({ email: CommonSchemas.email });
      const params = { email: 'not-an-email' };
      const result = validateQueryParams(params, schema);

      expect(result.valid).toBe(false);
    });

    it('should validate UUID format', () => {
      const schema = z.object({ id: CommonSchemas.uuid });
      const params = { id: '123e4567-e89b-12d3-a456-426614174000' };
      const result = validateQueryParams(params, schema);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const schema = z.object({ id: CommonSchemas.uuid });
      const params = { id: 'not-a-uuid' };
      const result = validateQueryParams(params, schema);

      expect(result.valid).toBe(false);
    });
  });

  describe('CommonSchemas', () => {
    it('should validate email schema', () => {
      const result = CommonSchemas.email.safeParse('test@example.com');
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = CommonSchemas.email.safeParse('invalid-email');
      expect(result.success).toBe(false);
    });

    it('should validate password schema', () => {
      const result = CommonSchemas.password.safeParse('ValidPassword123');
      expect(result.success).toBe(true);
    });

    it('should reject short password', () => {
      const result = CommonSchemas.password.safeParse('short');
      expect(result.success).toBe(false);
    });

    it('should validate UUID format', () => {
      const result = CommonSchemas.uuid.safeParse(
        '123e4567-e89b-12d3-a456-426614174000'
      );
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = CommonSchemas.uuid.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
    });
  });

  describe('DemoLoginSchema', () => {
    it('should validate demo login with valid email', () => {
      const data = { email: 'demo@example.com' };
      const result = DemoLoginSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should reject demo login with invalid email', () => {
      const data = { email: 'not-an-email' };
      const result = DemoLoginSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject demo login with missing email', () => {
      const data = {};
      const result = DemoLoginSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  describe('QRSessionGenerateSchema', () => {
    it('should validate QR session with device info', () => {
      const data = {
        deviceInfo: {
          userAgent: 'Mozilla/5.0...',
          platform: 'Linux',
          browser: 'Chrome',
        },
      };
      const result = QRSessionGenerateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should validate QR session without device info', () => {
      const data = {};
      const result = QRSessionGenerateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should allow partial device info', () => {
      const data = {
        deviceInfo: {
          userAgent: 'Mozilla/5.0...',
        },
      };
      const result = QRSessionGenerateSchema.safeParse(data);

      expect(result.success).toBe(true);
    });
  });

  describe('ContactSchema', () => {
    it('should validate contact with all required fields', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
      };
      const result = ContactSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should validate contact with optional email', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };
      const result = ContactSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should validate contact with phone and company', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        company: 'Acme Corp',
      };
      const result = ContactSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should reject contact with missing first name', () => {
      const data = {
        lastName: 'Doe',
      };
      const result = ContactSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject contact with missing last name', () => {
      const data = {
        firstName: 'John',
      };
      const result = ContactSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject contact with invalid email', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'not-an-email',
      };
      const result = ContactSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject contact with empty first name', () => {
      const data = {
        firstName: '',
        lastName: 'Doe',
      };
      const result = ContactSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  describe('Custom validation schemas', () => {
    it('should create and validate custom schema', () => {
      const customSchema = z.object({
        name: z.string().min(1),
        value: z.string(),
      });

      const data = { name: 'John', value: 'test' };
      const result = validateQueryParams(data, customSchema);

      expect(result.valid).toBe(true);
    });

    it('should provide detailed error messages', () => {
      const customSchema = z.object({
        name: z.string().min(1, 'Name is required'),
        value: z.string().min(1, 'Value is required'),
      });

      const data = { name: '', value: '' };
      const result = validateQueryParams(data, customSchema);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Name');
      }
    });

    it('should handle optional fields', () => {
      const customSchema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const data = { required: 'value' };
      const result = validateQueryParams(data, customSchema);

      expect(result.valid).toBe(true);
    });

    it('should handle multiple string parameters', () => {
      const customSchema = z.object({
        search: z.string(),
        filter: z.string(),
        sort: z.string().optional(),
      });

      const data = {
        search: 'test',
        filter: 'active',
        sort: 'name',
      };
      const result = validateQueryParams(data, customSchema);

      expect(result.valid).toBe(true);
    });

    it('should reject with missing required fields', () => {
      const customSchema = z.object({
        search: z.string().min(1),
        filter: z.string().min(1),
      });

      const data = {
        search: 'test',
      };
      const result = validateQueryParams(data, customSchema);

      expect(result.valid).toBe(false);
    });
  });
});
