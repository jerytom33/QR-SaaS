/**
 * Search API Route Handler - Phase 2.2c
 * GET /api/v1/search - Global search
 * GET /api/v1/search/contacts - Contact search
 * GET /api/v1/search/companies - Company search
 * GET /api/v1/search/leads - Lead search
 * GET /api/v1/autocomplete/:type - Autocomplete suggestions
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCache } from '@/lib/cache'
import {
  FullTextSearchEngine,
  AutocompleteEngine,
  FuzzySearchEngine,
  SearchResultRanker,
  SearchIndexManager,
  SearchQueryAnalyzer
} from '@/lib/search/search-engine'
import { SELECTIVE_FIELDS } from '@/lib/db/query-optimizer'
import { db } from '@/lib/db'
import { z } from 'zod'

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const SearchQuerySchema = z.object({
  q: z.string().min(2).max(500).trim(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  type: z.enum(['contacts', 'companies', 'leads']).optional(),
  filters: z.string().optional(), // JSON string of filters
  fuzzy: z.boolean().default(false),
  rankBy: z.enum(['relevance', 'recent', 'priority']).default('relevance')
})

const AutocompleteQuerySchema = z.object({
  q: z.string().min(1).max(100).trim(),
  type: z.enum(['contact-name', 'company-name', 'email', 'domain', 'tags']),
  limit: z.coerce.number().int().min(1).max(50).default(10)
})

// ============================================================
// SEARCH HANDLER
// ============================================================

export async function GET(request: NextRequest) {
  try {
    // 1. Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const queryString = searchParams.get('q')

    if (!queryString) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 })
    }

    const params = {
      q: queryString,
      limit: searchParams.get('limit') || '20',
      offset: searchParams.get('offset') || '0',
      type: searchParams.get('type'),
      filters: searchParams.get('filters'),
      fuzzy: searchParams.get('fuzzy') === 'true',
      rankBy: searchParams.get('rankBy') || 'relevance'
    }

    // 2. Validate input
    try {
      SearchQuerySchema.parse(params)
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      )
    }

    // 3. Analyze query for injection/syntax issues
    const queryAnalysis = SearchQueryAnalyzer.validateQuery(params.q)
    if (!queryAnalysis.valid) {
      return NextResponse.json(
        { error: 'Invalid search query', details: queryAnalysis.errors },
        { status: 400 }
      )
    }

    // 4. Check cache first
    const cacheKey = `search:${params.q}:${params.type || 'global'}:${params.offset}`
    const cached = getCache().get<any>(cacheKey)
    if (cached) {
      return NextResponse.json({
        ...cached,
        cached: true,
        cacheKey
      })
    }

    // 5. Execute search
    let results: any

    if (params.fuzzy) {
      results = await handleFuzzySearch(params)
    } else if (params.type === 'contacts') {
      results = await FullTextSearchEngine.searchContacts(
        'default-tenant', // In production, get from context
        params.q,
        db,
        { limit: Number(params.limit), offset: Number(params.offset) }
      )
    } else if (params.type === 'companies') {
      results = await FullTextSearchEngine.searchCompanies('default-tenant', params.q, db, {
        limit: Number(params.limit),
        offset: Number(params.offset)
      })
    } else if (params.type === 'leads') {
      results = await FullTextSearchEngine.searchLeads('default-tenant', params.q, db, {
        limit: Number(params.limit),
        offset: Number(params.offset)
      })
    } else {
      // Global search
      results = await FullTextSearchEngine.globalSearch(
        'default-tenant',
        params.q,
        db,
        Number(params.limit)
      )
    }

    // 6. Rank results
    const ranked = SearchResultRanker.rankResults(
      Array.isArray(results) ? results : Array.isArray(results.contacts) ? [] : [results],
      {
        boostRecent: params.rankBy === 'recent',
        priorityTypes: params.rankBy === 'priority' ? ['lead'] : undefined
      }
    )

    // 7. Format response
    const response = SearchResultRanker.formatForResponse(
      (ranked as Array<any>).map((r: any) => ({ ...r, id: r.id || 'unknown' })),
      Number(params.limit)
    )

    // 8. Cache result
    getCache().set(cacheKey, response, 300) // 5 min cache

    return NextResponse.json({
      ...response,
      cached: false,
      suggestions: SearchQueryAnalyzer.getSuggestions(params.q)
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

// ============================================================
// AUTOCOMPLETE HANDLER
// ============================================================

export async function getAutocomplete(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const queryString = searchParams.get('q')

    if (!queryString) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    const params = {
      q: queryString,
      type: searchParams.get('type') as any,
      limit: searchParams.get('limit') || '10'
    }

    try {
      AutocompleteQuerySchema.parse(params)
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      )
    }

    // Check cache
    const cacheKey = `autocomplete:${params.type}:${params.q}`
    const cached = getCache().get<any>(cacheKey)
    if (cached) {
      return NextResponse.json({ suggestions: cached, cached: true })
    }

    let suggestions: any[] = []

    switch (params.type) {
      case 'contact-name':
        suggestions = await AutocompleteEngine.suggestContactNames(
          'default-tenant',
          params.q,
          db,
          Number(params.limit)
        )
        break
      case 'company-name':
        suggestions = await AutocompleteEngine.suggestCompanyNames(
          'default-tenant',
          params.q,
          db,
          Number(params.limit)
        )
        break
      case 'email':
        suggestions = await AutocompleteEngine.suggestEmails(
          'default-tenant',
          params.q,
          db,
          Number(params.limit)
        )
        break
      case 'domain':
        suggestions = await AutocompleteEngine.suggestDomains(
          'default-tenant',
          params.q,
          db,
          Number(params.limit)
        )
        break
      case 'tags':
        suggestions = await AutocompleteEngine.suggestTags(
          'default-tenant',
          params.q,
          db,
          Number(params.limit)
        )
        break
    }

    // Cache suggestions
    getCache().set(cacheKey, suggestions, 600) // 10 min cache

    return NextResponse.json({
      suggestions,
      total: suggestions.length,
      cached: false
    })
  } catch (error) {
    console.error('Autocomplete error:', error)
    return NextResponse.json({ error: 'Autocomplete failed' }, { status: 500 })
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function handleFuzzySearch(params: any): Promise<any> {
  const threshold = 0.7 // 70% similarity threshold

  let results: any[] = []

  // Get fuzzy results for each type
  const [fuzzyContacts, fuzzyCompanies] = await Promise.all([
    FuzzySearchEngine.fuzzySearchContacts('default-tenant', params.q, db, {
      threshold,
      limit: Number(params.limit)
    }),
    FuzzySearchEngine.fuzzySearchCompanies('default-tenant', params.q, db, {
      threshold,
      limit: Number(params.limit)
    })
  ])

  results = [
    ...fuzzyContacts.map((c: any) => ({ ...c, type: 'contact' })),
    ...fuzzyCompanies.map((c: any) => ({ ...c, type: 'company' }))
  ].sort((a, b) => (b.score || 0) - (a.score || 0))

  return results.slice(0, Number(params.limit))
}

// ============================================================
// INDEX STATS HANDLER
// ============================================================

export async function getSearchStats(request: NextRequest) {
  try {
    // Check cache
    const cacheKey = `search-stats:all`
    const cached = getCache().get<any>(cacheKey)
    if (cached) {
      return NextResponse.json({ ...cached, cached: true })
    }

    // Get stats
    const stats = await SearchIndexManager.getIndexStats('default-tenant', db)

    // Cache for 1 hour
    getCache().set(cacheKey, stats, 3600)

    return NextResponse.json({ ...stats, cached: false })
  } catch (error) {
    console.error('Stats error:', error)
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 })
  }
}

// ============================================================
// SEARCH HISTORY HANDLER
// ============================================================

export async function getSearchHistory(request: NextRequest) {
  try {
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || 10), 50)

    // Get recent search queries from global activities
    const history = await db.activity.findMany({
      where: {
        description: { contains: 'search' }
      },
      select: {
        id: true,
        description: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    // Extract search queries from descriptions
    const searches = history.map((h) => ({
      id: h.id,
      query: h.description?.replace('Searched for: ', '').replace(/"/g, '') || '',
      timestamp: h.createdAt
    }))

    return NextResponse.json({ searches, total: searches.length })
  } catch (error) {
    console.error('History error:', error)
    return NextResponse.json({ error: 'Failed to get history' }, { status: 500 })
  }
}
