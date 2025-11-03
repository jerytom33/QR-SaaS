/**
 * Unit Tests: Utility Functions
 * Tests for core utility and helper functions
 *
 * Phase 1.3: Unit Testing Framework Setup
 * Date: November 3, 2025
 */

import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('Utility Functions', () => {
  describe('cn() - className merger', () => {
    it('should merge simple class names', () => {
      const result = cn('px-2', 'py-1');
      expect(result).toContain('px-2');
      expect(result).toContain('py-1');
    });

    it('should handle conditional classes', () => {
      const isActive = true;
      const result = cn('base', isActive && 'active');
      expect(result).toContain('base');
      expect(result).toContain('active');
    });

    it('should merge conflicting Tailwind classes correctly', () => {
      // When two padding classes conflict, tailwind-merge should keep the last one
      const result = cn('px-2 py-1', 'px-4');
      expect(result).toContain('py-1');
      expect(result).toContain('px-4');
      expect(result).not.toContain('px-2');
    });

    it('should handle undefined and null values', () => {
      const result = cn('px-2', undefined, null, 'py-1');
      expect(result).toContain('px-2');
      expect(result).toContain('py-1');
    });

    it('should handle empty strings', () => {
      const result = cn('px-2', '', 'py-1');
      expect(result).toContain('px-2');
      expect(result).toContain('py-1');
    });

    it('should handle arrays of classes', () => {
      const result = cn(['px-2', 'py-1']);
      expect(result).toContain('px-2');
      expect(result).toContain('py-1');
    });

    it('should return empty string for no input', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle complex nested conditionals', () => {
      const isActive = true;
      const isDisabled = false;
      const result = cn(
        'base',
        isActive && 'active',
        isDisabled && 'disabled',
        'text-white'
      );
      expect(result).toContain('base');
      expect(result).toContain('active');
      expect(result).not.toContain('disabled');
      expect(result).toContain('text-white');
    });

    it('should merge multiple Tailwind utilities correctly', () => {
      const result = cn(
        'flex items-center justify-center',
        'w-full h-full',
        'bg-white text-black',
        'rounded-lg shadow-md'
      );
      expect(result).toContain('flex');
      expect(result).toContain('items-center');
      expect(result).toContain('justify-center');
      expect(result).toContain('w-full');
      expect(result).toContain('h-full');
      expect(result).toContain('bg-white');
      expect(result).toContain('text-black');
      expect(result).toContain('rounded-lg');
      expect(result).toContain('shadow-md');
    });

    it('should handle object notation', () => {
      const result = cn({
        'px-2': true,
        'py-1': false,
        'text-white': true,
      });
      expect(result).toContain('px-2');
      expect(result).not.toContain('py-1');
      expect(result).toContain('text-white');
    });
  });
});
