/**
 * Advanced Filter Builder for Complex Query Building
 * Supports AND/OR combinations, field mapping, and saved filter templates
 */

import {
  FilterOperator,
  FilterDataType,
  FILTER_OPERATORS,
  isOperatorSupportedForType,
  operatorToSql,
  operatorToPrismaWhere,
} from './filter-operators';

export type FilterLogic = 'AND' | 'OR';

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
  fieldType: FilterDataType;
}

export interface FilterGroup {
  logic: FilterLogic;
  conditions: (FilterCondition | FilterGroup)[];
}

export interface SavedFilter {
  id: string;
  name: string;
  description?: string;
  filters: FilterGroup;
  tenantId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
}

export interface FilterValidationError {
  field: string;
  operator: FilterOperator;
  reason: string;
}

export interface FilterBuilderOptions {
  fieldTypeMap?: Record<string, FilterDataType>;
  allowedFields?: string[];
  maxGroupDepth?: number;
  validateSql?: boolean;
}

/**
 * Validates a single filter condition
 */
export function validateCondition(
  condition: FilterCondition,
  options?: FilterBuilderOptions
): FilterValidationError | null {
  // Check if field is allowed
  if (options?.allowedFields && !options.allowedFields.includes(condition.field)) {
    return {
      field: condition.field,
      operator: condition.operator,
      reason: `Field '${condition.field}' is not allowed`,
    };
  }

  // Check if operator supports field type
  if (!isOperatorSupportedForType(condition.operator, condition.fieldType)) {
    return {
      field: condition.field,
      operator: condition.operator,
      reason: `Operator '${condition.operator}' does not support type '${condition.fieldType}'`,
    };
  }

  // Check if operator validates the value
  const operatorConfig = FILTER_OPERATORS[condition.operator];
  if (!operatorConfig.validate(condition.value, condition.fieldType)) {
    return {
      field: condition.field,
      operator: condition.operator,
      reason: `Invalid value for operator '${condition.operator}': ${JSON.stringify(condition.value)}`,
    };
  }

  return null;
}

/**
 * Validates entire filter group recursively
 */
export function validateFilterGroup(
  group: FilterGroup,
  options?: FilterBuilderOptions,
  depth: number = 0
): FilterValidationError[] {
  const errors: FilterValidationError[] = [];

  // Check max depth
  if (options?.maxGroupDepth && depth > options.maxGroupDepth) {
    return [{
      field: 'group',
      operator: 'eq',
      reason: `Filter group exceeds maximum nesting depth of ${options.maxGroupDepth}`,
    }];
  }

  // Validate conditions
  for (const condition of group.conditions) {
    if (isFilterCondition(condition)) {
      const error = validateCondition(condition, options);
      if (error) errors.push(error);
    } else {
      // Recursively validate nested group
      errors.push(...validateFilterGroup(condition, options, depth + 1));
    }
  }

  return errors;
}

/**
 * Type guard to check if item is a condition or group
 */
function isFilterCondition(item: FilterCondition | FilterGroup): item is FilterCondition {
  return 'field' in item && 'operator' in item && 'value' in item;
}

/**
 * Convert filter group to SQL WHERE clause
 */
export function filterGroupToSql(
  group: FilterGroup,
  tableAlias: string = ''
): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const clauses: string[] = [];

  for (const condition of group.conditions) {
    if (isFilterCondition(condition)) {
      const sql = operatorToSql(
        `${prefix}${condition.field}`,
        condition.operator,
        condition.value,
        condition.fieldType
      );
      if (sql) clauses.push(sql);
    } else {
      // Recursively convert nested group
      const nestedSql = filterGroupToSql(condition, tableAlias);
      if (nestedSql) clauses.push(`(${nestedSql})`);
    }
  }

  if (clauses.length === 0) return '';
  if (clauses.length === 1) return clauses[0];

  return clauses.join(` ${group.logic} `);
}

/**
 * Convert filter group to Prisma where clause
 */
export function filterGroupToPrismaWhere(
  group: FilterGroup
): Record<string, unknown> {
  if (group.conditions.length === 0) return {};
  if (group.conditions.length === 1) {
    const condition = group.conditions[0];
    if (isFilterCondition(condition)) {
      return operatorToPrismaWhere(
        condition.field,
        condition.operator,
        condition.value,
        condition.fieldType
      ) || {};
    } else {
      return filterGroupToPrismaWhere(condition);
    }
  }

  // Multiple conditions - use AND/OR operator
  const clauses = group.conditions.map(condition => {
    if (isFilterCondition(condition)) {
      return operatorToPrismaWhere(
        condition.field,
        condition.operator,
        condition.value,
        condition.fieldType
      ) || {};
    } else {
      return filterGroupToPrismaWhere(condition);
    }
  }).filter(clause => Object.keys(clause).length > 0);

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];

  return {
    [group.logic]: clauses,
  };
}

/**
 * Filter builder class for fluent API
 */
export class FilterBuilder {
  private filters: FilterGroup;
  private options: FilterBuilderOptions;
  private errors: FilterValidationError[] = [];

  constructor(logic: FilterLogic = 'AND', options?: FilterBuilderOptions) {
    this.filters = { logic, conditions: [] };
    this.options = {
      maxGroupDepth: 3,
      ...options,
    };
  }

  /**
   * Add a condition to the filter group
   */
  addCondition(
    field: string,
    operator: FilterOperator,
    value: unknown,
    fieldType: FilterDataType = 'string'
  ): this {
    const condition: FilterCondition = {
      field,
      operator,
      value,
      fieldType: this.options.fieldTypeMap?.[field] || fieldType,
    };

    const error = validateCondition(condition, this.options);
    if (error) {
      this.errors.push(error);
      return this;
    }

    this.filters.conditions.push(condition);
    return this;
  }

  /**
   * Add a nested filter group with different logic
   */
  addGroup(logic: FilterLogic, builder: (b: FilterBuilder) => void): this {
    const group = new FilterBuilder(logic, this.options);
    builder(group);

    this.filters.conditions.push(group.getFilterGroup());
    return this;
  }

  /**
   * Shorthand: Add equality condition
   */
  equals(field: string, value: unknown, fieldType: FilterDataType = 'string'): this {
    return this.addCondition(field, 'eq', value, fieldType);
  }

  /**
   * Shorthand: Add inequality condition
   */
  notEquals(field: string, value: unknown, fieldType: FilterDataType = 'string'): this {
    return this.addCondition(field, 'ne', value, fieldType);
  }

  /**
   * Shorthand: Add greater than condition
   */
  greaterThan(field: string, value: number | Date): this {
    const fieldType = value instanceof Date ? 'date' : 'number';
    return this.addCondition(field, 'gt', value, fieldType);
  }

  /**
   * Shorthand: Add less than condition
   */
  lessThan(field: string, value: number | Date): this {
    const fieldType = value instanceof Date ? 'date' : 'number';
    return this.addCondition(field, 'lt', value, fieldType);
  }

  /**
   * Shorthand: Add between condition
   */
  between(field: string, min: number | Date, max: number | Date): this {
    const fieldType = min instanceof Date ? 'date' : 'number';
    return this.addCondition(field, 'between', [min, max], fieldType);
  }

  /**
   * Shorthand: Add contains condition
   */
  contains(field: string, value: string): this {
    return this.addCondition(field, 'contains', value, 'string');
  }

  /**
   * Shorthand: Add startsWith condition
   */
  startsWith(field: string, value: string): this {
    return this.addCondition(field, 'startsWith', value, 'string');
  }

  /**
   * Shorthand: Add in condition
   */
  in(field: string, values: unknown[], fieldType: FilterDataType = 'string'): this {
    return this.addCondition(field, 'in', values, fieldType);
  }

  /**
   * Shorthand: Add isEmpty condition
   */
  isEmpty(field: string): this {
    return this.addCondition(field, 'isEmpty', null, 'string');
  }

  /**
   * Shorthand: Add isNotEmpty condition
   */
  isNotEmpty(field: string): this {
    return this.addCondition(field, 'isNotEmpty', null, 'string');
  }

  /**
   * Get current filter group
   */
  getFilterGroup(): FilterGroup {
    return this.filters;
  }

  /**
   * Check if filter is valid
   */
  isValid(): boolean {
    this.errors = validateFilterGroup(this.filters, this.options);
    return this.errors.length === 0;
  }

  /**
   * Get validation errors
   */
  getErrors(): FilterValidationError[] {
    return this.errors;
  }

  /**
   * Convert to SQL WHERE clause
   */
  toSql(tableAlias?: string): string {
    if (!this.isValid()) {
      return '';
    }
    return filterGroupToSql(this.filters, tableAlias);
  }

  /**
   * Convert to Prisma where object
   */
  toPrismaWhere(): Record<string, unknown> {
    if (!this.isValid()) {
      return {};
    }
    return filterGroupToPrismaWhere(this.filters);
  }

  /**
   * Clone the builder
   */
  clone(): FilterBuilder {
    const clone = new FilterBuilder(this.filters.logic, this.options);
    clone.filters = JSON.parse(JSON.stringify(this.filters));
    return clone;
  }

  /**
   * Clear all filters
   */
  clear(): this {
    this.filters.conditions = [];
    this.errors = [];
    return this;
  }

  /**
   * Get count of conditions
   */
  count(): number {
    let count = 0;
    const countConditions = (group: FilterGroup) => {
      for (const condition of group.conditions) {
        if (isFilterCondition(condition)) {
          count++;
        } else {
          countConditions(condition);
        }
      }
    };
    countConditions(this.filters);
    return count;
  }
}

/**
 * Filter template factory - creates predefined filter builders
 */
export class FilterTemplates {
  /**
   * Contacts filter: active, created in last 30 days, specific statuses
   */
  static contactsRecent(days: number = 30): FilterBuilder {
    const builder = new FilterBuilder('AND');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - days);

    return builder
      .addCondition('deleted_at', 'isEmpty', null, 'date')
      .addCondition('created_at', 'gte', thirtyDaysAgo, 'date');
  }

  /**
   * High-value leads filter: specific pipeline and multiple statuses
   */
  static highValueLeads(): FilterBuilder {
    const builder = new FilterBuilder('AND');
    return builder
      .addCondition('status', 'in', ['qualified', 'negotiating'], 'string')
      .addCondition('estimated_value', 'gte', 50000, 'number')
      .addCondition('deleted_at', 'isEmpty', null, 'date');
  }

  /**
   * Inactive companies: no activity in 90 days
   */
  static inactiveCompanies(): FilterBuilder {
    const builder = new FilterBuilder('AND');
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    return builder
      .addCondition('last_activity_date', 'lte', ninetyDaysAgo, 'date')
      .addCondition('deleted_at', 'isEmpty', null, 'date');
  }

  /**
   * Employees at domain: email domain matching, not deleted
   */
  static employeesAtDomain(domain: string): FilterBuilder {
    const builder = new FilterBuilder('AND');
    return builder
      .addCondition('email', 'endsWith', `@${domain}`, 'string')
      .addCondition('deleted_at', 'isEmpty', null, 'date');
  }

  /**
   * Unqualified leads: specific statuses or score below threshold
   */
  static unqualifiedLeads(): FilterBuilder {
    const builder = new FilterBuilder('AND');
    return builder
      .addCondition('status', 'in', ['rejected', 'unqualified'], 'string')
      .addCondition('deleted_at', 'isEmpty', null, 'date');
  }
}

/**
 * Parse filter string to FilterGroup
 * Format: "field1:op1:value1 AND field2:op2:value2 OR field3:op3:value3"
 */
export function parseFilterString(
  filterStr: string,
  fieldTypeMap?: Record<string, FilterDataType>
): FilterBuilder | null {
  if (!filterStr || typeof filterStr !== 'string') {
    return null;
  }

  try {
    const builder = new FilterBuilder('AND', { fieldTypeMap });
    
    // Split by AND/OR operators while preserving them
    const tokens = filterStr.split(/\s+(AND|OR)\s+/i);
    let currentLogic: FilterLogic = 'AND';

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim();

      if (token.toUpperCase() === 'AND') {
        currentLogic = 'AND';
        continue;
      }
      if (token.toUpperCase() === 'OR') {
        currentLogic = 'OR';
        continue;
      }

      // Parse condition: field:operator:value
      const parts = token.split(':');
      if (parts.length >= 3) {
        const field = parts[0].trim();
        const operator = parts[1].trim().toLowerCase() as FilterOperator;
        const value = parts.slice(2).join(':').trim();

        const fieldType = fieldTypeMap?.[field] || 'string';
        builder.addCondition(field, operator, value, fieldType);
      }
    }

    return builder;
  } catch {
    return null;
  }
}

/**
 * Apply multiple filters with AND logic by default
 */
export function combineFilters(...builders: FilterBuilder[]): FilterBuilder {
  const combined = new FilterBuilder('AND');
  
  for (const builder of builders) {
    const group = builder.getFilterGroup();
    for (const condition of group.conditions) {
      if (isFilterCondition(condition)) {
        combined.addCondition(
          condition.field,
          condition.operator,
          condition.value,
          condition.fieldType
        );
      } else {
        // Recursively add nested group - would need addGroup support
        // For now, just add to combined group
        const combinedGroup = combined.getFilterGroup();
        combinedGroup.conditions.push(condition);
      }
    }
  }

  return combined;
}

/**
 * Optimize filter group by reordering for index efficiency
 * Places indexed fields first, reduces index scans
 */
export function optimizeFilterGroup(
  group: FilterGroup,
  indexedFields: string[]
): FilterGroup {
  const indexed: (FilterCondition | FilterGroup)[] = [];
  const nonIndexed: (FilterCondition | FilterGroup)[] = [];

  for (const condition of group.conditions) {
    if (isFilterCondition(condition)) {
      if (indexedFields.includes(condition.field)) {
        indexed.push(condition);
      } else {
        nonIndexed.push(condition);
      }
    } else {
      // Recursively optimize nested groups
      nonIndexed.push(optimizeFilterGroup(condition, indexedFields));
    }
  }

  return {
    ...group,
    conditions: [...indexed, ...nonIndexed],
  };
}
