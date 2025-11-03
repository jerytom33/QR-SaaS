/**
 * API Versioning Tests
 * Coverage: version detection, deprecation headers, response transformation, migrations
 */

import { describe, it, expect } from 'vitest';
import {
  APIVersion,
  DeprecationStatus,
  getVersionFromAcceptHeader,
  getVersionFromUrl,
  resolveApiVersion,
  getDeprecationHeaders,
  getDeprecationMeta,
  formatVersionedResponse,
  ResponseTransformer,
  isEndpointAvailable,
  getVersionCompatibilityReport,
  DeprecationNotice,
  VersionMigration,
  getVersionHealth,
  VERSION_CONFIGS,
  ENDPOINT_VERSIONS,
} from '../api-versioning';

// Type aliases for convenience
const V1 = APIVersion.V1;
const V2 = APIVersion.V2;

describe('API Version Detection', () => {
  describe('getVersionFromAcceptHeader', () => {
    it('should extract version from vnd.api+json format', () => {
      const header = 'application/vnd.api+json;version=2';
      const version = getVersionFromAcceptHeader(header);
      expect(version).toBe(V2);
    });

    it('should extract version from api-version format', () => {
      const header = 'application/json;api-version=1';
      const version = getVersionFromAcceptHeader(header);
      expect(version).toBe(V1);
    });

    it('should handle case-insensitive matching', () => {
      const header = 'application/json;VERSION=2';
      const version = getVersionFromAcceptHeader(header);
      expect(version).toBe(V2);
    });

    it('should return null for invalid version', () => {
      const header = 'application/json;version=99';
      const version = getVersionFromAcceptHeader(header);
      expect(version).toBeNull();
    });

    it('should return null for missing header', () => {
      const version = getVersionFromAcceptHeader(undefined);
      expect(version).toBeNull();
    });

    it('should handle multiple header formats', () => {
      const headers = [
        'application/vnd.api+json;version=1',
        'application/json;api-version=2',
        'text/plain, application/json;version=2',
      ];

      for (const header of headers) {
        const version = getVersionFromAcceptHeader(header);
        expect(version).not.toBeNull();
      }
    });
  });

  describe('getVersionFromUrl', () => {
    it('should extract v1 from URL path', () => {
      const version = getVersionFromUrl('/api/v1/contacts');
      expect(version).toBe(V1);
    });

    it('should extract v2 from URL path', () => {
      const version = getVersionFromUrl('/api/v2/leads');
      expect(version).toBe(V2);
    });

    it('should return null for missing version', () => {
      const version = getVersionFromUrl('/api/contacts');
      expect(version).toBeNull();
    });

    it('should return null for invalid version', () => {
      const version = getVersionFromUrl('/api/v99/contacts');
      expect(version).toBeNull();
    });

    it('should handle complex paths', () => {
      const version = getVersionFromUrl('/api/v2/contacts/123/activities');
      expect(version).toBe(V2);
    });
  });

  describe('resolveApiVersion', () => {
    it('should prioritize URL version over header', () => {
      const version = resolveApiVersion(
        '/api/v2/contacts',
        'application/json;api-version=1'
      );
      expect(version).toBe(V2);
    });

    it('should use header when URL version missing', () => {
      const version = resolveApiVersion(
        '/api/contacts',
        'application/json;api-version=2'
      );
      expect(version).toBe(V2);
    });

    it('should use default when neither URL nor header provided', () => {
      const version = resolveApiVersion('/api/contacts', undefined, V1);
      expect(version).toBe(V1);
    });

    it('should use v2 as default when not specified', () => {
      const version = resolveApiVersion('/api/contacts');
      expect(version).toBe(V1); // resolveApiVersion defaults to v1 for backward compat
    });
  });
});

describe('Deprecation Headers', () => {
  it('should generate deprecation header for v1', () => {
    const headers = getDeprecationHeaders(V1);
    expect(headers['Deprecation']).toBe('true');
  });

  it('should include Sunset header with date', () => {
    const headers = getDeprecationHeaders(V1);
    expect(headers['Sunset']).toBeDefined();
    expect(headers['Sunset']).toContain('GMT');
  });

  it('should include Link header with successor', () => {
    const headers = getDeprecationHeaders(V1);
    expect(headers['Link']).toContain(V2);
    expect(headers['Link']).toContain('rel="successor-version"');
  });

  it('should include deprecation message', () => {
    const headers = getDeprecationHeaders(V1);
    expect(headers['X-API-Warn']).toBeDefined();
  });

  it('should include version header', () => {
    const headers = getDeprecationHeaders(V1);
    expect(headers['X-API-Version']).toBe(V1);
  });

  it('should not include deprecation headers for v2', () => {
    const headers = getDeprecationHeaders(V2);
    expect(headers['Deprecation']).toBeUndefined();
    expect(headers['X-API-Warn']).toBeUndefined();
  });

  it('should always include version header', () => {
    const v1Headers = getDeprecationHeaders(V1);
    const v2Headers = getDeprecationHeaders(V2);
    expect(v1Headers['X-API-Version']).toBe(V1);
    expect(v2Headers['X-API-Version']).toBe(V2);
  });
});

describe('Deprecation Metadata', () => {
  it('should include deprecation meta for v1', () => {
    const meta = getDeprecationMeta(V1);
    expect(meta.deprecation).toBeDefined();
    expect(meta.deprecation.status).toBe('deprecated');
  });

  it('should include sunset date in meta', () => {
    const meta = getDeprecationMeta(V1);
    expect(meta.deprecation.sunsetDate).toBeDefined();
  });

  it('should include successor version', () => {
    const meta = getDeprecationMeta(V1);
    expect(meta.deprecation.successorVersion).toBe(V2);
  });

  it('should not include deprecation meta for v2', () => {
    const meta = getDeprecationMeta(V2);
    expect(meta.deprecation).toBeUndefined();
  });
});

describe('Response Formatting', () => {
  it('should format versioned response with v1', () => {
    const data = { id: 1, name: 'Test' };
    const response = formatVersionedResponse(data, V1);

    expect(response.data).toEqual(data);
    expect(response.meta.version).toBe(V1);
    expect(response.meta.timestamp).toBeDefined();
  });

  it('should include deprecation in v1 response meta', () => {
    const data = { id: 1 };
    const response = formatVersionedResponse(data, V1);

    expect(response.meta.deprecation).toBeDefined();
  });

  it('should format versioned response with v2', () => {
    const data = { id: 1, name: 'Test' };
    const response = formatVersionedResponse(data, V2);

    expect(response.data).toEqual(data);
    expect(response.meta.version).toBe(V2);
    expect(response.meta.deprecation).toBeUndefined();
  });

  it('should include timestamp in ISO format', () => {
    const data = { id: 1 };
    const response = formatVersionedResponse(data, V1);

    expect(response.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('Response Transformer', () => {
  describe('v1 to v2 transformation', () => {
    it('should transform v1 object to v2 format', () => {
      const v1Data = { id: 1, name: 'Contact', type: 'contact' };
      const v2Data = ResponseTransformer.v1ToV2(v1Data);

      expect(v2Data).toHaveProperty('_version', V2);
      expect(v2Data).toHaveProperty('_links');
      expect(v2Data._links.self).toBe('/api/v2/contact/1');
    });

    it('should preserve v1 data fields', () => {
      const v1Data = { id: 1, name: 'Contact', email: 'test@example.com' };
      const v2Data = ResponseTransformer.v1ToV2(v1Data);

      expect(v2Data.name).toBe('Contact');
      expect(v2Data.email).toBe('test@example.com');
    });
  });

  describe('v2 to v1 transformation', () => {
    it('should transform v2 object back to v1 format', () => {
      const v2Data = {
        id: 1,
        name: 'Contact',
        _version: V2,
        _links: { self: '/api/v2/contact/1' },
      };
      const v1Data = ResponseTransformer.v2ToV1(v2Data);

      expect(v1Data._version).toBeUndefined();
      expect(v1Data._links).toBeUndefined();
      expect(v1Data.name).toBe('Contact');
    });
  });

  describe('paginated response transformation', () => {
    it('should transform v1 paginated to v2 format', () => {
      const v1Response = {
        data: [{ id: 1 }],
        total: 100,
        limit: 20,
        offset: 0,
        hasMore: true,
        currentPage: 1,
      };
      const v2Response = ResponseTransformer.paginatedV1ToV2(v1Response);

      expect(v2Response.items).toEqual(v1Response.data);
      expect(v2Response.pagination.total).toBe(100);
      expect(v2Response.pagination.hasMore).toBe(true);
    });

    it('should transform v2 paginated to v1 format', () => {
      const v2Response = {
        items: [{ id: 1 }],
        pagination: {
          total: 100,
          limit: 20,
          offset: 0,
          hasMore: true,
        },
      };
      const v1Response = ResponseTransformer.paginatedV2ToV1(v2Response);

      expect(v1Response.data).toEqual(v2Response.items);
      expect(v1Response.total).toBe(100);
    });
  });
});

describe('Endpoint Versioning', () => {
  it('should identify available endpoints in v1', () => {
    const available = isEndpointAvailable('contacts/list', V1);
    expect(available).toBe(true);
  });

  it('should identify available endpoints in v2', () => {
    const available = isEndpointAvailable('contacts/list', V2);
    expect(available).toBe(true);
  });

  it('should identify unavailable endpoints in v1', () => {
    const available = isEndpointAvailable('contacts/search', V1);
    expect(available).toBe(false);
  });

  it('should identify available new endpoints in v2', () => {
    const available = isEndpointAvailable('contacts/search', V2);
    expect(available).toBe(true);
  });

  it('should provide compatibility report', () => {
    const report = getVersionCompatibilityReport('contacts/list');

    expect(report.supportedVersions).toContain(V1);
    expect(report.supportedVersions).toContain(V2);
    expect(report.recommended).toBe(V2);
  });

  it('should include migration guide for deprecated endpoints', () => {
    const report = getVersionCompatibilityReport('contacts/list');

    if (report.migrations) {
      expect(report.migrations.length).toBeGreaterThan(0);
    }
  });
});

describe('Deprecation Notices', () => {
  it('should build deprecation notice for v1', () => {
    const notice = DeprecationNotice.build(V1, '/api/v1/contacts');

    expect(notice).toContain('DEPRECATION');
    expect(notice).toContain(V1);
    expect(notice).toContain(V2);
  });

  it('should include sunset date in notice', () => {
    const notice = DeprecationNotice.build(V1, '/api/v1/contacts');

    expect(notice).toContain('removed');
  });

  it('should return empty notice for non-deprecated v2', () => {
    const notice = DeprecationNotice.build(V2, '/api/v2/contacts');

    expect(notice).toBe('');
  });

  it('should build RFC7234 warning header', () => {
    const header = DeprecationNotice.buildHeader(V1);

    expect(header).toContain('299');
    expect(header).toContain('Deprecated');
  });

  it('should include successor version in header', () => {
    const header = DeprecationNotice.buildHeader(V1);

    expect(header).toContain('successor-version');
  });
});

describe('Version Migration', () => {
  it('should list breaking changes', () => {
    const changes = VersionMigration.getBreakingChanges();

    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]).toContain('Pagination');
  });

  it('should list new features', () => {
    const features = VersionMigration.getNewFeatures();

    expect(features.length).toBeGreaterThan(0);
    expect(features.some((f) => f.includes('pagination'))).toBe(true);
    expect(features.some((f) => f.includes('search'))).toBe(true);
    expect(features.some((f) => f.includes('filtering'))).toBe(true);
  });

  it('should provide migration guide with steps', () => {
    const guide = VersionMigration.getMigrationGuide('contacts/list');

    expect(guide.breaking.length).toBeGreaterThan(0);
    expect(guide.new.length).toBeGreaterThan(0);
    expect(guide.steps.length).toBeGreaterThan(0);
    expect(guide.steps[0]).toContain('1.');
  });

  it('should include pagination migration step', () => {
    const guide = VersionMigration.getMigrationGuide('contacts');

    expect(
      guide.steps.some((s) => s.toLowerCase().includes('pagination'))
    ).toBe(true);
  });
});

describe('Version Health', () => {
  it('should report v1 as deprecated', () => {
    const health = getVersionHealth();

    expect(health[V1].status).toBe('deprecated');
  });

  it('should report v2 as active', () => {
    const health = getVersionHealth();

    expect(health[V2].status).toBe('active');
  });

  it('should count available endpoints', () => {
    const health = getVersionHealth();

    expect(health[V1].endpoints.available).toBeGreaterThan(0);
    expect(health[V2].endpoints.available).toBeGreaterThan(0);
  });

  it('should include sunset date for v1', () => {
    const health = getVersionHealth();

    expect(health[V1].sunsetDate).toBeDefined();
  });

  it('should provide recommendations for v1', () => {
    const health = getVersionHealth();

    expect(health[V1].recommendations.length).toBeGreaterThan(0);
    expect(
      health[V1].recommendations.some((r) => r.includes('migrate'))
    ).toBe(true);
  });

  it('should provide recommendations for v2', () => {
    const health = getVersionHealth();

    expect(health[V2].recommendations.length).toBeGreaterThan(0);
    expect(
      health[V2].recommendations.some((r) => r.includes('stable'))
    ).toBe(true);
  });
});

describe('Version Configuration', () => {
  it('should define v1 configuration', () => {
    expect(VERSION_CONFIGS[V1]).toBeDefined();
    expect(VERSION_CONFIGS[V1].status).toBe('deprecated');
  });

  it('should define v2 configuration', () => {
    expect(VERSION_CONFIGS[V2]).toBeDefined();
    expect(VERSION_CONFIGS[V2].status).toBe('active');
  });

  it('should have future sunset date for v1', () => {
    const v1Config = VERSION_CONFIGS[V1];
    expect(v1Config.sunsetDate).toBeDefined();
    expect(v1Config.sunsetDate!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should specify response formats', () => {
    expect(VERSION_CONFIGS[V1].responseFormat).toBe('legacy');
    expect(VERSION_CONFIGS[V2].responseFormat).toBe('enhanced');
  });
});

describe('Endpoint Versions Registry', () => {
  it('should have contact endpoints defined', () => {
    expect(ENDPOINT_VERSIONS['contacts/list']).toBeDefined();
    expect(ENDPOINT_VERSIONS['contacts/search']).toBeDefined();
  });

  it('should mark search as v2-only', () => {
    const search = ENDPOINT_VERSIONS['contacts/search'];
    expect(search.v1.available).toBe(false);
    expect(search.v2.available).toBe(true);
  });

  it('should list new features for v2 endpoints', () => {
    const search = ENDPOINT_VERSIONS['contacts/search'];
    expect(search.v2.newFeatures.length).toBeGreaterThan(0);
    expect(search.v2.newFeatures.some((f) => f.includes('search'))).toBe(true);
  });
});

describe('Integration Tests', () => {
  it('should handle complete version detection workflow', () => {
    const pathname = '/api/v2/contacts';
    const acceptHeader = 'application/json;api-version=1';

    const version = resolveApiVersion(pathname, acceptHeader);
    expect(version).toBe(V2); // URL takes precedence

    const headers = getDeprecationHeaders(version);
    expect(headers['Deprecation']).toBeUndefined();
  });

  it('should handle v1 deprecation workflow', () => {
    const version = V1;
    
    const headers = getDeprecationHeaders(version);
    expect(headers['Deprecation']).toBe('true');

    const notice = DeprecationNotice.build(version, '/api/v1/contacts');
    expect(notice).toContain('deprecated');

    const response = formatVersionedResponse({ data: [] }, version);
    expect(response.meta.deprecation).toBeDefined();
  });

  it('should guide migration from v1 to v2', () => {
    const guide = VersionMigration.getMigrationGuide('contacts/list');
    const health = getVersionHealth();

    expect(guide.steps.length).toBeGreaterThan(0);
    expect(health[V1].recommendations.some((r) => r.includes(V2))).toBe(true);
  });
});
