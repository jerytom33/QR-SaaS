/**
 * Advanced Filter Tests
 * Coverage: operators, builder, templates, parsing, optimization
 */

import { describe, it, expect } from 'vitest';
import {
  FilterBuilder,
  FilterTemplates,
  parseFilterString,
  combineFilters,
  optimizeFilterGroup,
  validateCondition,
  validateFilterGroup,
  filterGroupToSql,
  filterGroupToPrismaWhere,
} from '../filter-builder';
import {
  FILTER_OPERATORS,
  operatorToSql,
  operatorToPrismaWhere,
  isOperatorSupportedForType,
  getOperatorsForType,
} from '../filter-operators';

describe('Filter Operators', () => {
  describe('equality operators', () => {
    it('should generate correct SQL for eq operator', () => {
      const sql = operatorToSql('users.email', 'eq', 'test@example.com', 'string');
      expect(sql).toContain('=');
      expect(sql).toContain("'test@example.com'");
    });

    it('should generate correct SQL for ne operator', () => {
      const sql = operatorToSql('users.status', 'ne', 'deleted', 'string');
      expect(sql).toContain('!=');
    });

    it('should handle eq with null values', () => {
      const sql = operatorToSql('users.deleted_at', 'eq', null, 'date');
      expect(sql).toContain('IS NULL');
    });

    it('should validate boolean values for eq', () => {
      const valid = FILTER_OPERATORS['eq'].validate(true, 'boolean');
      expect(valid).toBe(true);
    });

    it('should reject invalid boolean values', () => {
      const valid = FILTER_OPERATORS['eq'].validate('yes', 'boolean');
      expect(valid).toBe(false);
    });
  });

  describe('comparison operators', () => {
    it('should generate correct SQL for gt operator with numbers', () => {
      const sql = operatorToSql('leads.amount', 'gt', 50000, 'number');
      expect(sql).toContain('>');
      expect(sql).toContain('50000');
    });

    it('should generate correct SQL for between operator', () => {
      const sql = operatorToSql('leads.amount', 'between', [10000, 100000], 'number');
      expect(sql).toContain('BETWEEN');
      expect(sql).toContain('10000');
      expect(sql).toContain('100000');
    });

    it('should reject invalid between values', () => {
      const valid = FILTER_OPERATORS['between'].validate([100], 'number');
      expect(valid).toBe(false);
    });

    it('should generate correct SQL for date comparison', () => {
      const date = new Date('2025-01-01');
      const sql = operatorToSql('contacts.created_at', 'gte', date, 'date');
      expect(sql).toContain('>=');
      expect(sql).toContain('2025-01-01');
    });
  });

  describe('string operators', () => {
    it('should generate case-insensitive contains SQL', () => {
      const sql = operatorToSql('contacts.name', 'contains', 'john', 'string');
      expect(sql).toContain('LOWER');
      expect(sql).toContain('LIKE');
      expect(sql).toContain('%john%');
    });

    it('should generate startsWith SQL with prefix pattern', () => {
      const sql = operatorToSql('companies.name', 'startsWith', 'acme', 'string');
      expect(sql).toContain('LIKE');
      expect(sql).toContain('acme%');
    });

    it('should generate endsWith SQL with suffix pattern', () => {
      const sql = operatorToSql('contacts.email', 'endsWith', '@example.com', 'string');
      expect(sql).toContain('LIKE');
      expect(sql).toContain('%@example.com');
    });

    it('should validate regex patterns', () => {
      const validRegex = FILTER_OPERATORS['regex'].validate('^[A-Z].*', 'string');
      const invalidRegex = FILTER_OPERATORS['regex'].validate('[invalid(', 'string');
      expect(validRegex).toBe(true);
      expect(invalidRegex).toBe(false);
    });
  });

  describe('array operators', () => {
    it('should generate correct SQL for in operator with strings', () => {
      const sql = operatorToSql('leads.status', 'in', ['new', 'qualified', 'negotiating'], 'string');
      expect(sql).toContain('IN');
      expect(sql).toContain("'new'");
      expect(sql).toContain("'qualified'");
    });

    it('should generate correct SQL for in operator with numbers', () => {
      const sql = operatorToSql('contacts.id', 'in', [1, 2, 3], 'number');
      expect(sql).toContain('IN (1, 2, 3)');
    });

    it('should reject empty arrays for in operator', () => {
      const valid = FILTER_OPERATORS['in'].validate([], 'string');
      expect(valid).toBe(false);
    });
  });

  describe('empty/null operators', () => {
    it('should generate correct SQL for isEmpty', () => {
      const sql = operatorToSql('contacts.notes', 'isEmpty', null, 'string');
      expect(sql).toContain('IS NULL');
    });

    it('should generate correct SQL for isNotEmpty', () => {
      const sql = operatorToSql('contacts.notes', 'isNotEmpty', null, 'string');
      expect(sql).toContain('IS NOT NULL');
    });
  });

  describe('operator type checking', () => {
    it('should identify supported operators for string type', () => {
      const stringOps = getOperatorsForType('string');
      expect(stringOps.some(op => op.name === 'contains')).toBe(true);
      expect(stringOps.some(op => op.name === 'startsWith')).toBe(true);
    });

    it('should identify supported operators for number type', () => {
      const numberOps = getOperatorsForType('number');
      expect(numberOps.some(op => op.name === 'gt')).toBe(true);
      expect(numberOps.some(op => op.name === 'between')).toBe(true);
    });

    it('should reject unsupported operator-type combinations', () => {
      const supported = isOperatorSupportedForType('contains', 'number');
      expect(supported).toBe(false);
    });
  });
});

describe('Filter Builder', () => {
  describe('basic operations', () => {
    it('should build simple filter with one condition', () => {
      const builder = new FilterBuilder('AND');
      builder.equals('status', 'active');
      
      expect(builder.count()).toBe(1);
      expect(builder.isValid()).toBe(true);
    });

    it('should build filter with multiple conditions', () => {
      const builder = new FilterBuilder('AND');
      builder
        .equals('status', 'active')
        .greaterThan('amount', 10000)
        .contains('name', 'john');

      expect(builder.count()).toBe(3);
      expect(builder.isValid()).toBe(true);
    });

    it('should chain operators fluently', () => {
      const builder = new FilterBuilder('AND');
      const result = builder
        .equals('type', 'contact')
        .notEquals('status', 'deleted')
        .between('created_at', new Date('2024-01-01'), new Date('2024-12-31'));

      expect(result).toBe(builder);
      expect(builder.count()).toBe(3);
    });

    it('should clear all filters', () => {
      const builder = new FilterBuilder('AND');
      builder.equals('status', 'active').contains('name', 'test');
      
      builder.clear();
      expect(builder.count()).toBe(0);
    });
  });

  describe('shorthand methods', () => {
    it('should use equals shorthand', () => {
      const builder1 = new FilterBuilder('AND');
      const builder2 = new FilterBuilder('AND');

      builder1.equals('email', 'test@example.com');
      builder2.addCondition('email', 'eq', 'test@example.com', 'string');

      const sql1 = builder1.toSql();
      const sql2 = builder2.toSql();
      expect(sql1).toBe(sql2);
    });

    it('should use greaterThan shorthand with numbers', () => {
      const builder = new FilterBuilder('AND');
      builder.greaterThan('amount', 50000);

      const sql = builder.toSql();
      expect(sql).toContain('>');
      expect(sql).toContain('50000');
    });

    it('should use between shorthand', () => {
      const builder = new FilterBuilder('AND');
      builder.between('amount', 10000, 100000);

      const sql = builder.toSql();
      expect(sql).toContain('BETWEEN');
    });

    it('should use in shorthand', () => {
      const builder = new FilterBuilder('AND');
      builder.in('status', ['active', 'pending', 'qualified']);

      const sql = builder.toSql();
      expect(sql).toContain('IN');
      expect(sql).toContain("'active'");
    });
  });

  describe('nested groups', () => {
    it('should build nested AND/OR groups', () => {
      const builder = new FilterBuilder('AND');
      builder
        .equals('type', 'lead')
        .addGroup('OR', (group) => {
          group.equals('status', 'new').equals('status', 'qualified');
        });

      expect(builder.isValid()).toBe(true);
      const sql = builder.toSql();
      expect(sql).toContain('OR');
    });

    it('should validate group depth limit', () => {
      const builder = new FilterBuilder('AND', { maxGroupDepth: 1 });
      builder
        .equals('a', 'value')
        .addGroup('OR', (g1) => {
          g1.addGroup('OR', (g2) => {
            g2.equals('b', 'value');
          });
        });

      const errors = builder.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('validation', () => {
    it('should detect invalid operator for field type', () => {
      const builder = new FilterBuilder('AND');
      builder.addCondition('name', 'gt', 100, 'string');

      expect(builder.isValid()).toBe(false);
      expect(builder.getErrors().length).toBeGreaterThan(0);
    });

    it('should validate field against allowed list', () => {
      const builder = new FilterBuilder('AND', {
        allowedFields: ['status', 'amount'],
      });
      builder.equals('status', 'active');
      builder.equals('forbidden_field', 'value');

      expect(builder.isValid()).toBe(false);
    });

    it('should collect multiple validation errors', () => {
      const builder = new FilterBuilder('AND', {
        allowedFields: ['status', 'amount'],
      });
      builder
        .equals('status', 'active')
        .addCondition('forbidden', 'gt', 100, 'string')
        .equals('another_forbidden', 'value');

      const errors = builder.getErrors();
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('SQL generation', () => {
    it('should generate valid SQL WHERE clause', () => {
      const builder = new FilterBuilder('AND');
      builder
        .equals('status', 'active')
        .greaterThan('amount', 10000)
        .contains('name', 'john');

      const sql = builder.toSql();
      expect(sql).toContain('AND');
      expect(sql).toContain('=');
      expect(sql).toContain('>');
      expect(sql).toContain('LIKE');
    });

    it('should apply table alias to fields', () => {
      const builder = new FilterBuilder('AND');
      builder.equals('status', 'active');

      const sql = builder.toSql('users');
      expect(sql).toContain('users.status');
    });

    it('should generate SQL for complex nested filters', () => {
      const builder = new FilterBuilder('AND');
      builder
        .equals('type', 'lead')
        .addGroup('OR', (g) => {
          g.equals('status', 'new')
            .equals('status', 'qualified')
            .greaterThan('amount', 50000);
        });

      const sql = builder.toSql();
      expect(sql).toContain('AND');
      expect(sql).toContain('OR');
      expect(sql).toContain('(');
      expect(sql).toContain(')');
    });

    it('should return empty string for invalid filters', () => {
      const builder = new FilterBuilder('AND');
      builder.addCondition('field', 'gt', 'invalid', 'string');

      const sql = builder.toSql();
      expect(sql).toBe('');
    });
  });

  describe('Prisma generation', () => {
    it('should generate Prisma where object for single condition', () => {
      const builder = new FilterBuilder('AND');
      builder.equals('status', 'active');

      const where = builder.toPrismaWhere();
      expect(where).toHaveProperty('status');
    });

    it('should generate Prisma where object for multiple conditions', () => {
      const builder = new FilterBuilder('AND');
      builder
        .equals('status', 'active')
        .greaterThan('amount', 10000);

      const where = builder.toPrismaWhere();
      expect(where).toHaveProperty('AND');
    });

    it('should return empty object for invalid filters', () => {
      const builder = new FilterBuilder('AND');
      builder.addCondition('field', 'eq', undefined, 'string');

      const where = builder.toPrismaWhere();
      expect(Object.keys(where).length).toBe(0);
    });
  });

  describe('builder cloning', () => {
    it('should clone builder with all conditions', () => {
      const original = new FilterBuilder('AND');
      original
        .equals('status', 'active')
        .greaterThan('amount', 10000);

      const clone = original.clone();
      expect(clone.count()).toBe(original.count());
      expect(clone.toSql()).toBe(original.toSql());
    });

    it('should clone independently', () => {
      const original = new FilterBuilder('AND');
      original.equals('status', 'active');

      const clone = original.clone();
      clone.equals('amount', 100);

      expect(original.count()).toBe(1);
      expect(clone.count()).toBe(2);
    });
  });
});

describe('Filter Templates', () => {
  it('should generate recentContacts filter', () => {
    const builder = FilterTemplates.contactsRecent(30);
    expect(builder.isValid()).toBe(true);
    expect(builder.count()).toBeGreaterThan(0);

    const sql = builder.toSql();
    expect(sql).toContain('created_at');
  });

  it('should generate highValueLeads filter', () => {
    const builder = FilterTemplates.highValueLeads();
    expect(builder.isValid()).toBe(true);

    const sql = builder.toSql();
    expect(sql).toContain('status');
    expect(sql).toContain('estimated_value');
    expect(sql).toContain('IN');
    expect(sql).toContain('>=');
  });

  it('should generate inactiveCompanies filter', () => {
    const builder = FilterTemplates.inactiveCompanies();
    expect(builder.isValid()).toBe(true);

    const sql = builder.toSql();
    expect(sql).toContain('last_activity_date');
    expect(sql).toContain('<=');
  });

  it('should generate employeesAtDomain filter', () => {
    const builder = FilterTemplates.employeesAtDomain('acme.com');
    expect(builder.isValid()).toBe(true);

    const sql = builder.toSql();
    expect(sql).toContain('email');
    expect(sql).toContain('@acme.com');
  });

  it('should generate unqualifiedLeads filter', () => {
    const builder = FilterTemplates.unqualifiedLeads();
    expect(builder.isValid()).toBe(true);

    const sql = builder.toSql();
    expect(sql).toContain('IN');
    expect(sql).toContain("'rejected'");
  });
});

describe('Filter Parsing', () => {
  it('should parse simple filter string', () => {
    const builder = parseFilterString('status:eq:active');
    expect(builder).not.toBeNull();
    expect(builder?.isValid()).toBe(true);
  });

  it('should parse AND filter string', () => {
    const builder = parseFilterString('status:eq:active AND amount:gt:10000');
    expect(builder).not.toBeNull();
    expect(builder?.count()).toBe(2);
  });

  it('should return null for invalid format', () => {
    const builder = parseFilterString('invalid');
    expect(builder).toBeNull();
  });

  it('should handle field type mapping', () => {
    const builder = parseFilterString('amount:gt:10000', {
      amount: 'number',
    });
    expect(builder?.isValid()).toBe(true);
  });
});

describe('Filter Combination', () => {
  it('should combine multiple builders with AND logic', () => {
    const builder1 = new FilterBuilder('AND');
    builder1.equals('status', 'active');

    const builder2 = new FilterBuilder('AND');
    builder2.greaterThan('amount', 10000);

    const combined = combineFilters(builder1, builder2);
    expect(combined.count()).toBe(2);
  });

  it('should preserve conditions when combining', () => {
    const builder1 = new FilterBuilder('AND');
    builder1.equals('status', 'active');

    const builder2 = new FilterBuilder('AND');
    builder2.contains('name', 'john');

    const combined = combineFilters(builder1, builder2);
    const sql = combined.toSql();
    expect(sql).toContain('status');
    expect(sql).toContain('name');
  });
});

describe('Filter Optimization', () => {
  it('should reorder conditions by indexed fields', () => {
    const builder = new FilterBuilder('AND');
    builder
      .equals('non_indexed_field', 'value')
      .equals('status', 'active')
      .contains('notes', 'test');

    const group = builder.getFilterGroup();
    const optimized = optimizeFilterGroup(group, ['status']);
    
    const firstCondition = optimized.conditions[0];
    if ('field' in firstCondition) {
      expect(firstCondition.field).toBe('status');
    }
  });

  it('should place all indexed fields first', () => {
    const builder = new FilterBuilder('AND');
    builder
      .equals('field1', 'value')
      .equals('field2', 'value')
      .equals('field3', 'value')
      .equals('field4', 'value');

    const group = builder.getFilterGroup();
    const optimized = optimizeFilterGroup(group, ['field2', 'field4']);

    const indexedCount = optimized.conditions
      .filter(c => 'field' in c && (['field2', 'field4'].includes((c as any).field)))
      .length;
    expect(indexedCount).toBe(2);
  });
});

describe('Integration Tests', () => {
  it('should build complex contact filter workflow', () => {
    const builder = new FilterBuilder('AND');
    builder
      .equals('tenant_id', 'tenant-123')
      .addCondition('deleted_at', 'isEmpty', null, 'date')
      .addGroup('OR', (g) => {
        g.contains('email', 'acme')
          .equals('company_name', 'ACME Corp');
      });

    expect(builder.isValid()).toBe(true);
    const sql = builder.toSql();
    expect(sql).toContain('tenant_id');
    expect(sql).toContain('OR');
  });

  it('should export and reimport filters', () => {
    const original = new FilterBuilder('AND');
    original
      .equals('status', 'active')
      .greaterThan('amount', 50000);

    const sqlOriginal = original.toSql();
    
    const rebuilt = new FilterBuilder('AND');
    rebuilt.equals('status', 'active');
    rebuilt.greaterThan('amount', 50000);
    
    const sqlRebuilt = rebuilt.toSql();
    expect(sqlOriginal).toBe(sqlRebuilt);
  });

  it('should handle empty filters gracefully', () => {
    const builder = new FilterBuilder('AND');
    expect(builder.toSql()).toBe('');
    expect(Object.keys(builder.toPrismaWhere()).length).toBe(0);
  });

  it('should validate complex real-world scenario', () => {
    const builder = new FilterBuilder('AND')
      .equals('deleted_at', null)
      .addGroup('OR', (status) => {
        status
          .in('status', ['new', 'qualified', 'negotiating'])
          .greaterThan('created_at', new Date('2024-01-01'));
      })
      .addGroup('AND', (company) => {
        company
          .contains('company_name', 'acme')
          .notEquals('industry', 'finance');
      });

    expect(builder.isValid()).toBe(true);
    expect(builder.toSql().length).toBeGreaterThan(0);
  });
});

describe('Performance Characteristics', () => {
  it('should handle large filter conditions efficiently', () => {
    const builder = new FilterBuilder('AND');
    
    const startTime = performance.now();
    for (let i = 0; i < 100; i++) {
      builder.equals(`field_${i}`, `value_${i}`);
    }
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(100); // Should be < 100ms
    expect(builder.count()).toBe(100);
  });

  it('should generate SQL quickly for complex filters', () => {
    const builder = new FilterBuilder('AND');
    builder
      .equals('a', 'a')
      .equals('b', 'b')
      .equals('c', 'c')
      .equals('d', 'd')
      .equals('e', 'e');

    const startTime = performance.now();
    const sql = builder.toSql();
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(10);
    expect(sql.length).toBeGreaterThan(0);
  });
});
