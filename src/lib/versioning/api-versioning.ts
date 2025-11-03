/**
 * API Versioning System
 * Supports: URL versioning (/v1, /v2), Accept header negotiation, deprecation headers
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * API version enumeration
 */
export enum APIVersion {
  V1 = 'v1',
  V2 = 'v2',
}

/**
 * Version deprecation status
 */
export enum DeprecationStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  SUNSET = 'sunset', // Will be removed
}

/**
 * API version configuration
 */
export interface VersionConfig {
  version: APIVersion;
  status: DeprecationStatus;
  releaseDate: Date;
  sunsetDate?: Date; // When version will be removed
  deprecationDate?: Date; // When deprecation started
  successorVersion?: APIVersion; // Version to migrate to
  deprecationMessage?: string;
  responseFormat: 'legacy' | 'enhanced';
}

/**
 * Version metadata for response headers
 */
export interface VersionMetadata {
  version: APIVersion;
  status: DeprecationStatus;
  sunsetDate?: string;
  deprecationMessage?: string;
  successorVersion?: string;
}

/**
 * API response wrapper for versioning
 */
export interface VersionedResponse<T> {
  data: T;
  meta: {
    version: APIVersion;
    timestamp: string;
    deprecation?: {
      status: DeprecationStatus;
      message?: string;
      sunsetDate?: string;
      successorVersion?: string;
    };
  };
}

/**
 * Version configuration registry
 */
export const VERSION_CONFIGS: Record<APIVersion, VersionConfig> = {
  [APIVersion.V1]: {
    version: APIVersion.V1,
    status: DeprecationStatus.DEPRECATED,
    releaseDate: new Date('2024-06-01'),
    deprecationDate: new Date('2025-01-01'),
    sunsetDate: new Date('2025-06-30'),
    successorVersion: APIVersion.V2,
    deprecationMessage: 'API v1 is deprecated. Please migrate to v2 which includes enhanced pagination, filtering, and search capabilities.',
    responseFormat: 'legacy',
  },
  [APIVersion.V2]: {
    version: APIVersion.V2,
    status: DeprecationStatus.ACTIVE,
    releaseDate: new Date('2025-01-01'),
    successorVersion: undefined,
    deprecationMessage: undefined,
    responseFormat: 'enhanced',
  },
};

/**
 * Get version from Accept header
 * Supports: application/vnd.api+json;version=2, application/json;api-version=2
 */
export function getVersionFromAcceptHeader(acceptHeader?: string): APIVersion | null {
  if (!acceptHeader) return null;

  // Try vnd.api+json format
  const vndMatch = acceptHeader.match(/version=(\d+)/i);
  if (vndMatch) {
    const version = `v${vndMatch[1]}`;
    if (Object.values(APIVersion).includes(version as APIVersion)) {
      return version as APIVersion;
    }
  }

  // Try api-version format
  const versionMatch = acceptHeader.match(/api-version=(\d+)/i);
  if (versionMatch) {
    const version = `v${versionMatch[1]}`;
    if (Object.values(APIVersion).includes(version as APIVersion)) {
      return version as APIVersion;
    }
  }

  return null;
}

/**
 * Get version from URL path
 * Expects: /api/v1/... or /api/v2/...
 */
export function getVersionFromUrl(pathname: string): APIVersion | null {
  const match = pathname.match(/\/api\/(v\d+)\//);
  if (match && Object.values(APIVersion).includes(match[1] as APIVersion)) {
    return match[1] as APIVersion;
  }
  return null;
}

/**
 * Resolve API version from request
 * Priority: URL path > Accept header > default (v1)
 */
export function resolveApiVersion(
  pathname: string,
  acceptHeader?: string,
  defaultVersion: APIVersion = APIVersion.V1
): APIVersion {
  // Try URL first (highest priority)
  const urlVersion = getVersionFromUrl(pathname);
  if (urlVersion) return urlVersion;

  // Try Accept header
  const headerVersion = getVersionFromAcceptHeader(acceptHeader);
  if (headerVersion) return headerVersion;

  // Use default
  return defaultVersion;
}

/**
 * Build deprecation headers for response
 */
export function getDeprecationHeaders(version: APIVersion): Record<string, string> {
  const config = VERSION_CONFIGS[version];
  const headers: Record<string, string> = {};

  if (config.status === DeprecationStatus.DEPRECATED) {
    headers['Deprecation'] = 'true';
    headers['Sunset'] = config.sunsetDate?.toUTCString() || '';

    if (config.successorVersion) {
      headers['Link'] = `</api/${config.successorVersion}/...>; rel="successor-version"`;
    }

    if (config.deprecationMessage) {
      // Properly encoded in header
      headers['X-API-Warn'] = config.deprecationMessage;
    }
  }

  // Add version header
  headers['X-API-Version'] = version;

  return headers;
}

/**
 * Create deprecation warning meta
 */
export function getDeprecationMeta(version: APIVersion): { deprecation?: any } {
  const config = VERSION_CONFIGS[version];

  if (config.status === DeprecationStatus.DEPRECATED) {
    return {
      deprecation: {
        status: config.status,
        message: config.deprecationMessage,
        sunsetDate: config.sunsetDate?.toISOString(),
        successorVersion: config.successorVersion,
      },
    };
  }

  return {};
}

/**
 * Format versioned response
 */
export function formatVersionedResponse<T>(
  data: T,
  version: APIVersion
): VersionedResponse<T> {
  return {
    data,
    meta: {
      version,
      timestamp: new Date().toISOString(),
      ...getDeprecationMeta(version),
    },
  };
}

/**
 * Create Next.js response with version headers
 */
export function createVersionedResponse<T>(
  data: T,
  version: APIVersion,
  statusCode: number = 200
): NextResponse {
  const body = formatVersionedResponse(data, version);
  const headers = getDeprecationHeaders(version);

  return NextResponse.json(body, {
    status: statusCode,
    headers: new Headers(headers),
  });
}

/**
 * Response format transformer
 * Convert v1 response format to v2 or vice versa
 */
export class ResponseTransformer {
  /**
   * Transform v1 response to v2 format
   * Adds pagination metadata, nested relationships
   */
  static v1ToV2<T extends Record<string, any>>(data: T): any {
    return {
      ...data,
      // Add v2-specific fields if needed
      _version: 'v2',
      _links: {
        self: data.id ? `/api/v2/${data.type || 'resources'}/${data.id}` : undefined,
      },
    };
  }

  /**
   * Transform v2 response to v1 format (for backward compatibility)
   * Removes v2-specific metadata, flattens relationships
   */
  static v2ToV1<T extends Record<string, any>>(data: T): any {
    const { _version, _links, ...rest } = data;
    return rest;
  }

  /**
   * Transform paginated v1 response to v2 format
   */
  static paginatedV1ToV2(response: any): any {
    return {
      items: response.data || response.items,
      pagination: {
        total: response.total,
        limit: response.limit,
        offset: response.offset,
        hasMore: response.hasMore,
        currentPage: response.currentPage,
        pageCount: response.pageCount,
        // Add v2 cursor-based pagination
        cursor: response.cursor,
        nextCursor: response.nextCursor,
      },
    };
  }

  /**
   * Transform paginated v2 response to v1 format
   */
  static paginatedV2ToV1(response: any): any {
    return {
      data: response.items,
      total: response.pagination?.total,
      limit: response.pagination?.limit,
      offset: response.pagination?.offset,
      hasMore: response.pagination?.hasMore,
      currentPage: response.pagination?.currentPage,
      pageCount: response.pagination?.pageCount,
    };
  }
}

/**
 * Version-specific endpoint configuration
 */
export interface EndpointVersionConfig {
  path: string;
  v1: {
    available: boolean;
    deprecated?: boolean;
    responseFormat: 'legacy' | 'enhanced';
  };
  v2: {
    available: boolean;
    newFeatures: string[]; // What's new in v2
  };
}

/**
 * Endpoint version registry
 */
export const ENDPOINT_VERSIONS: Record<string, EndpointVersionConfig> = {
  'contacts/list': {
    path: '/api/:version/contacts',
    v1: {
      available: true,
      deprecated: true,
      responseFormat: 'legacy',
    },
    v2: {
      available: true,
      newFeatures: [
        'cursor-based pagination',
        'advanced filtering',
        'full-text search',
        'field selection',
      ],
    },
  },
  'contacts/search': {
    path: '/api/:version/contacts/search',
    v1: {
      available: false,
      responseFormat: 'legacy',
    },
    v2: {
      available: true,
      newFeatures: ['full-text search', 'autocomplete', 'fuzzy matching'],
    },
  },
  'leads/list': {
    path: '/api/:version/leads',
    v1: {
      available: true,
      deprecated: true,
      responseFormat: 'legacy',
    },
    v2: {
      available: true,
      newFeatures: [
        'advanced filtering',
        'cursor pagination',
        'window functions',
      ],
    },
  },
  'analytics/dashboard': {
    path: '/api/:version/analytics/dashboard',
    v1: {
      available: true,
      responseFormat: 'legacy',
    },
    v2: {
      available: true,
      newFeatures: ['new dashboard format', 'enhanced metrics'],
    },
  },
};

/**
 * Check if endpoint is available in version
 */
export function isEndpointAvailable(
  endpointKey: string,
  version: APIVersion
): boolean {
  const config = ENDPOINT_VERSIONS[endpointKey];
  if (!config) return true; // Unknown endpoint, assume available

  return version === APIVersion.V1
    ? config.v1.available
    : config.v2.available;
}

/**
 * Get version compatibility report
 */
export function getVersionCompatibilityReport(
  endpointKey: string
): {
  supportedVersions: APIVersion[];
  recommended: APIVersion;
  migrations?: string[];
} {
  const config = ENDPOINT_VERSIONS[endpointKey];
  if (!config) {
    return {
      supportedVersions: [APIVersion.V1, APIVersion.V2],
      recommended: APIVersion.V2,
    };
  }

  const supported: APIVersion[] = [];
  if (config.v1.available) supported.push(APIVersion.V1);
  if (config.v2.available) supported.push(APIVersion.V2);

  return {
    supportedVersions: supported,
    recommended: APIVersion.V2,
    migrations: config.v1.deprecated ? config.v2.newFeatures : undefined,
  };
}

/**
 * Validate version string
 */
export const VersionSchema = z.enum(['v1', 'v2']).catch(APIVersion.V1);

/**
 * Version middleware hook
 * Extract version from request and validate
 */
export function getVersionFromRequest(
  pathname: string,
  headers?: Record<string, string>
): APIVersion {
  const acceptHeader = headers?.['accept'] || headers?.['Accept'];
  return resolveApiVersion(pathname, acceptHeader, APIVersion.V2);
}

/**
 * Deprecation notice builder
 */
export class DeprecationNotice {
  static build(version: APIVersion, endpoint: string): string {
    const config = VERSION_CONFIGS[version];
    if (config.status !== DeprecationStatus.DEPRECATED) return '';

    let notice = `[DEPRECATION] ${endpoint} using ${version} is deprecated.`;

    if (config.sunsetDate) {
      notice += ` This endpoint will be removed on ${config.sunsetDate.toDateString()}.`;
    }

    if (config.successorVersion) {
      notice += ` Please migrate to ${config.successorVersion}.`;
    }

    if (config.deprecationMessage) {
      notice += ` ${config.deprecationMessage}`;
    }

    return notice;
  }

  static buildHeader(version: APIVersion): string {
    const config = VERSION_CONFIGS[version];
    if (config.status !== DeprecationStatus.DEPRECATED) return '';

    const warning: string[] = [];
    warning.push(`299 - "${config.deprecationMessage || 'Deprecated API'}"`);

    if (config.sunsetDate) {
      warning.push(`; sunset="${config.sunsetDate.toUTCString()}"`);
    }

    if (config.successorVersion) {
      warning.push(`; link="</api/${config.successorVersion}/>; rel=successor-version"`);
    }

    return warning.join('');
  }
}

/**
 * Version migration helper
 * Helps identify changes between versions
 */
export class VersionMigration {
  /**
   * Get breaking changes from v1 to v2
   */
  static getBreakingChanges(): string[] {
    return [
      'Pagination format changed from offset/limit to cursor-based',
      'Response structure changed (data nested in response)',
      'Filter syntax changed (new operator support)',
      'Sort order parameters renamed',
      'Error response format updated',
    ];
  }

  /**
   * Get new features in v2
   */
  static getNewFeatures(): string[] {
    return [
      'Cursor-based pagination for infinite scroll',
      'Advanced filtering with complex conditions',
      'Full-text search with autocomplete',
      'Field selection for optimized responses',
      'Response caching support',
      'Query optimization hints',
      'Window functions for analytics',
      'API versioning and deprecation headers',
    ];
  }

  /**
   * Get migration guide for endpoint
   */
  static getMigrationGuide(endpoint: string): {
    breaking: string[];
    new: string[];
    steps: string[];
  } {
    return {
      breaking: this.getBreakingChanges(),
      new: this.getNewFeatures(),
      steps: [
        '1. Update client to handle cursor-based pagination',
        '2. Replace offset/limit with cursor/limit',
        '3. Update filter syntax in requests',
        '4. Test thoroughly in staging',
        '5. Deploy and monitor',
      ],
    };
  }
}

/**
 * Version health check
 */
export interface VersionHealthCheck {
  version: APIVersion;
  status: DeprecationStatus;
  endpoints: {
    available: number;
    deprecated: number;
    unavailable: number;
  };
  sunsetDate?: string;
  recommendations: string[];
}

export function getVersionHealth(): Record<APIVersion, VersionHealthCheck> {
  const health: Record<APIVersion, VersionHealthCheck> = {
    [APIVersion.V1]: {
      version: APIVersion.V1,
      status: VERSION_CONFIGS[APIVersion.V1].status,
      endpoints: {
        available: Object.values(ENDPOINT_VERSIONS).filter(
          (e) => e.v1.available
        ).length,
        deprecated: Object.values(ENDPOINT_VERSIONS).filter(
          (e) => e.v1.available && e.v1.deprecated
        ).length,
        unavailable: Object.values(ENDPOINT_VERSIONS).filter(
          (e) => !e.v1.available
        ).length,
      },
      sunsetDate: VERSION_CONFIGS[APIVersion.V1].sunsetDate?.toISOString(),
      recommendations: [
        'Migrate to v2 before sunset date',
        'Update client to use cursor pagination',
        'Test migration in staging first',
      ],
    },
    [APIVersion.V2]: {
      version: APIVersion.V2,
      status: VERSION_CONFIGS[APIVersion.V2].status,
      endpoints: {
        available: Object.values(ENDPOINT_VERSIONS).filter(
          (e) => e.v2.available
        ).length,
        deprecated: 0,
        unavailable: Object.values(ENDPOINT_VERSIONS).filter(
          (e) => !e.v2.available
        ).length,
      },
      recommendations: [
        'Current stable version',
        'Use this version for new implementations',
        'All endpoints recommended for this version',
      ],
    },
  };

  return health;
}
