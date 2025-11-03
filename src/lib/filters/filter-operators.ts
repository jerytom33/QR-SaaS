/**
 * Advanced Filter Operators for Complex Query Building
 * Supports: eq, ne, gt, lt, gte, lte, in, contains, startsWith, endsWith, regex, between
 * With type validation and SQL generation
 */

export type FilterOperator = 
  | 'eq' 
  | 'ne' 
  | 'gt' 
  | 'lt' 
  | 'gte' 
  | 'lte' 
  | 'in' 
  | 'contains' 
  | 'startsWith' 
  | 'endsWith' 
  | 'regex' 
  | 'between'
  | 'isEmpty'
  | 'isNotEmpty';

export type FilterDataType = 'string' | 'number' | 'boolean' | 'date' | 'array';

export interface FilterValue {
  value: unknown;
  type: FilterDataType;
}

export interface FilterOperatorConfig {
  name: FilterOperator;
  supportedTypes: FilterDataType[];
  description: string;
  requiresArray?: boolean;
  validate: (value: unknown, fieldType: FilterDataType) => boolean;
  toSql: (field: string, value: unknown, fieldType: FilterDataType) => string;
  toPrismaWhere?: (field: string, value: unknown, fieldType: FilterDataType) => Record<string, unknown>;
}

/**
 * Validates if a value is a valid date string or Date object
 */
function isValidDate(value: unknown): boolean {
  if (value instanceof Date) return !isNaN(value.getTime());
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return !isNaN(timestamp);
  }
  return false;
}

/**
 * Converts value to SQL-safe string with proper escaping
 */
function escapeSqlString(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

/**
 * Equality operator
 */
export const EqualOperator: FilterOperatorConfig = {
  name: 'eq',
  supportedTypes: ['string', 'number', 'boolean', 'date'],
  description: 'Equals - exact match',
  validate: (value, fieldType) => {
    if (value === null || value === undefined) return false;
    if (fieldType === 'boolean') return typeof value === 'boolean';
    if (fieldType === 'number') return typeof value === 'number' || !isNaN(Number(value));
    if (fieldType === 'date') return isValidDate(value);
    if (fieldType === 'string') return typeof value === 'string' && value.length > 0;
    return false;
  },
  toSql: (field, value, fieldType) => {
    if (value === null) return `${field} IS NULL`;
    if (fieldType === 'date') {
      const dateStr = value instanceof Date ? value.toISOString() : String(value);
      return `${field} = ${escapeSqlString(dateStr)}`;
    }
    if (fieldType === 'boolean') return `${field} = ${value === true ? 'true' : 'false'}`;
    if (fieldType === 'number') return `${field} = ${Number(value)}`;
    return `${field} = ${escapeSqlString(String(value))}`;
  },
  toPrismaWhere: (field, value) => ({
    [field]: value,
  }),
};

/**
 * Not equal operator
 */
export const NotEqualOperator: FilterOperatorConfig = {
  name: 'ne',
  supportedTypes: ['string', 'number', 'boolean', 'date'],
  description: 'Not equals - exclude matches',
  validate: EqualOperator.validate,
  toSql: (field, value, fieldType) => {
    if (value === null) return `${field} IS NOT NULL`;
    if (fieldType === 'date') {
      const dateStr = value instanceof Date ? value.toISOString() : String(value);
      return `${field} != ${escapeSqlString(dateStr)}`;
    }
    if (fieldType === 'boolean') return `${field} != ${value === true ? 'true' : 'false'}`;
    if (fieldType === 'number') return `${field} != ${Number(value)}`;
    return `${field} != ${escapeSqlString(String(value))}`;
  },
  toPrismaWhere: (field, value) => ({
    [field]: { not: value },
  }),
};

/**
 * Greater than operator
 */
export const GreaterThanOperator: FilterOperatorConfig = {
  name: 'gt',
  supportedTypes: ['number', 'date'],
  description: 'Greater than - values above threshold',
  validate: (value, fieldType) => {
    if (fieldType === 'number') return typeof value === 'number' || !isNaN(Number(value));
    if (fieldType === 'date') return isValidDate(value);
    return false;
  },
  toSql: (field, value, fieldType) => {
    if (fieldType === 'date') {
      const dateStr = value instanceof Date ? value.toISOString() : String(value);
      return `${field} > ${escapeSqlString(dateStr)}`;
    }
    return `${field} > ${Number(value)}`;
  },
  toPrismaWhere: (field, value, fieldType) => ({
    [field]: { gt: fieldType === 'date' ? new Date(value as string) : value },
  }),
};

/**
 * Less than operator
 */
export const LessThanOperator: FilterOperatorConfig = {
  name: 'lt',
  supportedTypes: ['number', 'date'],
  description: 'Less than - values below threshold',
  validate: GreaterThanOperator.validate,
  toSql: (field, value, fieldType) => {
    if (fieldType === 'date') {
      const dateStr = value instanceof Date ? value.toISOString() : String(value);
      return `${field} < ${escapeSqlString(dateStr)}`;
    }
    return `${field} < ${Number(value)}`;
  },
  toPrismaWhere: (field, value, fieldType) => ({
    [field]: { lt: fieldType === 'date' ? new Date(value as string) : value },
  }),
};

/**
 * Greater than or equal operator
 */
export const GreaterThanEqualOperator: FilterOperatorConfig = {
  name: 'gte',
  supportedTypes: ['number', 'date'],
  description: 'Greater than or equal',
  validate: GreaterThanOperator.validate,
  toSql: (field, value, fieldType) => {
    if (fieldType === 'date') {
      const dateStr = value instanceof Date ? value.toISOString() : String(value);
      return `${field} >= ${escapeSqlString(dateStr)}`;
    }
    return `${field} >= ${Number(value)}`;
  },
  toPrismaWhere: (field, value, fieldType) => ({
    [field]: { gte: fieldType === 'date' ? new Date(value as string) : value },
  }),
};

/**
 * Less than or equal operator
 */
export const LessThanEqualOperator: FilterOperatorConfig = {
  name: 'lte',
  supportedTypes: ['number', 'date'],
  description: 'Less than or equal',
  validate: GreaterThanOperator.validate,
  toSql: (field, value, fieldType) => {
    if (fieldType === 'date') {
      const dateStr = value instanceof Date ? value.toISOString() : String(value);
      return `${field} <= ${escapeSqlString(dateStr)}`;
    }
    return `${field} <= ${Number(value)}`;
  },
  toPrismaWhere: (field, value, fieldType) => ({
    [field]: { lte: fieldType === 'date' ? new Date(value as string) : value },
  }),
};

/**
 * In operator - value is in array
 */
export const InOperator: FilterOperatorConfig = {
  name: 'in',
  supportedTypes: ['string', 'number', 'boolean'],
  description: 'In list - match any value in array',
  requiresArray: true,
  validate: (value, fieldType) => {
    if (!Array.isArray(value) || value.length === 0) return false;
    if (fieldType === 'boolean') return value.every(v => typeof v === 'boolean');
    if (fieldType === 'number') return value.every(v => typeof v === 'number' || !isNaN(Number(v)));
    if (fieldType === 'string') return value.every(v => typeof v === 'string' && v.length > 0);
    return false;
  },
  toSql: (field, value, fieldType) => {
    if (!Array.isArray(value)) return `${field} IN (NULL)`;
    if (fieldType === 'boolean') {
      const boolVals = (value as boolean[]).map(v => v ? 'true' : 'false').join(', ');
      return `${field} IN (${boolVals})`;
    }
    if (fieldType === 'number') {
      const numVals = (value as number[]).map(v => Number(v)).join(', ');
      return `${field} IN (${numVals})`;
    }
    const strVals = (value as string[]).map(v => escapeSqlString(v)).join(', ');
    return `${field} IN (${strVals})`;
  },
  toPrismaWhere: (field, value) => ({
    [field]: { in: value },
  }),
};

/**
 * Contains operator - string contains substring
 */
export const ContainsOperator: FilterOperatorConfig = {
  name: 'contains',
  supportedTypes: ['string'],
  description: 'Contains substring - case-insensitive',
  validate: (value, fieldType) => {
    return fieldType === 'string' && typeof value === 'string' && value.length > 0;
  },
  toSql: (field, value) => {
    return `LOWER(${field}) LIKE LOWER(${escapeSqlString(`%${String(value)}%`)})`;
  },
  toPrismaWhere: (field, value) => ({
    [field]: { contains: value, mode: 'insensitive' },
  }),
};

/**
 * StartsWith operator
 */
export const StartsWithOperator: FilterOperatorConfig = {
  name: 'startsWith',
  supportedTypes: ['string'],
  description: 'Starts with - prefix matching',
  validate: ContainsOperator.validate,
  toSql: (field, value) => {
    return `LOWER(${field}) LIKE LOWER(${escapeSqlString(`${String(value)}%`)})`;
  },
  toPrismaWhere: (field, value) => ({
    [field]: { startsWith: value, mode: 'insensitive' },
  }),
};

/**
 * EndsWith operator
 */
export const EndsWithOperator: FilterOperatorConfig = {
  name: 'endsWith',
  supportedTypes: ['string'],
  description: 'Ends with - suffix matching',
  validate: ContainsOperator.validate,
  toSql: (field, value) => {
    return `LOWER(${field}) LIKE LOWER(${escapeSqlString(`%${String(value)}`)})`;
  },
  toPrismaWhere: (field, value) => ({
    [field]: { endsWith: value, mode: 'insensitive' },
  }),
};

/**
 * Regex operator - pattern matching
 */
export const RegexOperator: FilterOperatorConfig = {
  name: 'regex',
  supportedTypes: ['string'],
  description: 'Regex pattern matching',
  validate: (value, fieldType) => {
    if (fieldType !== 'string' || typeof value !== 'string') return false;
    try {
      new RegExp(value);
      return true;
    } catch {
      return false;
    }
  },
  toSql: (field, value) => {
    // PostgreSQL regex operator
    return `${field} ~ ${escapeSqlString(String(value))}`;
  },
  toPrismaWhere: (field, value) => ({
    [field]: { search: value },
  }),
};

/**
 * Between operator - value is between two numbers/dates
 */
export const BetweenOperator: FilterOperatorConfig = {
  name: 'between',
  supportedTypes: ['number', 'date'],
  description: 'Between two values - inclusive range',
  requiresArray: true,
  validate: (value, fieldType) => {
    if (!Array.isArray(value) || value.length !== 2) return false;
    if (fieldType === 'number') {
      const [min, max] = value;
      return (typeof min === 'number' || !isNaN(Number(min))) &&
             (typeof max === 'number' || !isNaN(Number(max)));
    }
    if (fieldType === 'date') {
      return isValidDate(value[0]) && isValidDate(value[1]);
    }
    return false;
  },
  toSql: (field, value, fieldType) => {
    if (!Array.isArray(value) || value.length !== 2) return 'FALSE';
    const [min, max] = value;
    if (fieldType === 'date') {
      const minStr = min instanceof Date ? min.toISOString() : String(min);
      const maxStr = max instanceof Date ? max.toISOString() : String(max);
      return `${field} BETWEEN ${escapeSqlString(minStr)} AND ${escapeSqlString(maxStr)}`;
    }
    return `${field} BETWEEN ${Number(min)} AND ${Number(max)}`;
  },
  toPrismaWhere: (field, value) => {
    if (!Array.isArray(value) || value.length !== 2) return {};
    return {
      AND: [
        { [field]: { gte: value[0] } },
        { [field]: { lte: value[1] } },
      ],
    };
  },
};

/**
 * IsEmpty operator - field is NULL or empty string
 */
export const IsEmptyOperator: FilterOperatorConfig = {
  name: 'isEmpty',
  supportedTypes: ['string', 'number', 'date'],
  description: 'Is empty - NULL or empty value',
  validate: () => true,
  toSql: (field) => `(${field} IS NULL OR ${field} = '')`,
  toPrismaWhere: (field) => ({
    OR: [
      { [field]: null },
      { [field]: '' },
    ],
  }),
};

/**
 * IsNotEmpty operator - field is not NULL and not empty string
 */
export const IsNotEmptyOperator: FilterOperatorConfig = {
  name: 'isNotEmpty',
  supportedTypes: ['string', 'number', 'date'],
  description: 'Is not empty - NOT NULL and not empty',
  validate: () => true,
  toSql: (field) => `(${field} IS NOT NULL AND ${field} != '')`,
  toPrismaWhere: (field) => ({
    AND: [
      { [field]: { not: null } },
      { NOT: { [field]: '' } },
    ],
  }),
};

/**
 * All available operators registry
 */
export const FILTER_OPERATORS: Record<FilterOperator, FilterOperatorConfig> = {
  eq: EqualOperator,
  ne: NotEqualOperator,
  gt: GreaterThanOperator,
  lt: LessThanOperator,
  gte: GreaterThanEqualOperator,
  lte: LessThanEqualOperator,
  in: InOperator,
  contains: ContainsOperator,
  startsWith: StartsWithOperator,
  endsWith: EndsWithOperator,
  regex: RegexOperator,
  between: BetweenOperator,
  isEmpty: IsEmptyOperator,
  isNotEmpty: IsNotEmptyOperator,
};

/**
 * Get operator by name
 */
export function getOperator(name: FilterOperator): FilterOperatorConfig | undefined {
  return FILTER_OPERATORS[name];
}

/**
 * Validate if operator supports field type
 */
export function isOperatorSupportedForType(
  operator: FilterOperator,
  fieldType: FilterDataType
): boolean {
  const config = getOperator(operator);
  if (!config) return false;
  return config.supportedTypes.includes(fieldType);
}

/**
 * Get all operators supporting a specific data type
 */
export function getOperatorsForType(fieldType: FilterDataType): FilterOperatorConfig[] {
  return Object.values(FILTER_OPERATORS).filter(op =>
    op.supportedTypes.includes(fieldType)
  );
}

/**
 * Convert filter operator config to SQL WHERE clause
 */
export function operatorToSql(
  field: string,
  operator: FilterOperator,
  value: unknown,
  fieldType: FilterDataType
): string | null {
  const config = getOperator(operator);
  if (!config) return null;

  if (!isOperatorSupportedForType(operator, fieldType)) {
    return null;
  }

  if (!config.validate(value, fieldType)) {
    return null;
  }

  try {
    return config.toSql(field, value, fieldType);
  } catch {
    return null;
  }
}

/**
 * Convert filter operator config to Prisma where clause
 */
export function operatorToPrismaWhere(
  field: string,
  operator: FilterOperator,
  value: unknown,
  fieldType: FilterDataType
): Record<string, unknown> | null {
  const config = getOperator(operator);
  if (!config || !config.toPrismaWhere) return null;

  if (!isOperatorSupportedForType(operator, fieldType)) {
    return null;
  }

  if (!config.validate(value, fieldType)) {
    return null;
  }

  try {
    return config.toPrismaWhere(field, value, fieldType);
  } catch {
    return null;
  }
}
