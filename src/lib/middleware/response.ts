/**
 * API Response Interceptor
 * Standardizes response format across all API endpoints
 */

import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  statusCode: number;
  timestamp: string;
}

/**
 * Success response factory
 */
export function successResponse<T>(
  data: T,
  message?: string,
  statusCode: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

/**
 * Error response factory
 */
export function errorResponse(
  error: string,
  message?: string,
  statusCode: number = 500
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  );
}

/**
 * Paginated response factory
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number = 1,
  pageSize: number = 10
): NextResponse<ApiResponse<PaginatedResponse<T>>> {
  return successResponse({
    items,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}
