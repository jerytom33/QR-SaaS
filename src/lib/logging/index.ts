/**
 * 12-Factor App: Factor XI - Logs
 * Treat logs as event streams
 */

import { config, monitoringConfig } from '@/lib/config';
import * as os from 'os';

// Log levels
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

// Log entry interface
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, any>;
  requestId?: string;
  userId?: string;
  tenantId?: string;
  pid?: number;
  hostname?: string;
}

// Logger class
export class Logger {
  private static instance: Logger;
  private hostname: string;

  private constructor() {
    this.hostname = os.hostname();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Format log entry based on configuration
  private formatLogEntry(entry: LogEntry): string {
    if (config.LOG_FORMAT === 'json') {
      return JSON.stringify(entry);
    } else {
      const levelName = LogLevel[entry.level];
      const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
      const context = entry.requestId ? ` [${entry.requestId}]` : '';
      return `${entry.timestamp} ${levelName}${context} ${entry.message}${meta}`;
    }
  }

  // Create log entry
  private createLogEntry(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
      pid: process.pid,
      hostname: this.hostname,
    };
  }

  // Write log entry
  private write(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);
    
    // Write to stdout (as per 12-factor app guidelines)
    if (entry.level <= LogLevel[config.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel]) {
      console.log(formatted);
    }

    // In production, you might also send to external logging service
    if (config.NODE_ENV === 'production' && monitoringConfig.sentry) {
      // Send to Sentry, New Relic, etc.
    }
  }

  // Log methods
  error(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, meta);
    this.write(entry);
  }

  warn(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, meta);
    this.write(entry);
  }

  info(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, meta);
    this.write(entry);
  }

  debug(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, meta);
    this.write(entry);
  }

  // Structured logging methods
  logRequest(method: string, url: string, statusCode: number, duration: number, requestId?: string): void {
    this.info('HTTP Request', {
      type: 'http_request',
      method,
      url,
      statusCode,
      duration,
      requestId,
    });
  }

  logError(error: Error, context?: Record<string, any>): void {
    this.error(error.message, {
      type: 'error',
      stack: error.stack,
      ...context,
    });
  }

  logDatabaseQuery(query: string, duration: number, error?: Error): void {
    if (error) {
      this.error('Database query failed', {
        type: 'database_query',
        query,
        duration,
        error: error.message,
      });
    } else {
      this.debug('Database query executed', {
        type: 'database_query',
        query,
        duration,
      });
    }
  }

  logAuthentication(event: string, userId?: string, tenantId?: string, meta?: Record<string, any>): void {
    this.info(`Authentication: ${event}`, {
      type: 'authentication',
      event,
      userId,
      tenantId,
      ...meta,
    });
  }

  logBusinessEvent(event: string, tenantId?: string, userId?: string, meta?: Record<string, any>): void {
    this.info(`Business Event: ${event}`, {
      type: 'business_event',
      event,
      tenantId,
      userId,
      ...meta,
    });
  }

  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high', meta?: Record<string, any>): void {
    const level = severity === 'high' ? LogLevel.ERROR : severity === 'medium' ? LogLevel.WARN : LogLevel.INFO;
    const entry = this.createLogEntry(level, `Security Event: ${event}`, {
      type: 'security_event',
      event,
      severity,
      ...meta,
    });
    this.write(entry);
  }

  logPerformanceMetric(metric: string, value: number, unit?: string, meta?: Record<string, any>): void {
    this.info(`Performance: ${metric}`, {
      type: 'performance_metric',
      metric,
      value,
      unit,
      ...meta,
    });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Request context logger
export class RequestContextLogger {
  private requestId: string;
  private userId?: string;
  private tenantId?: string;
  private hostname: string;

  constructor(requestId: string, userId?: string, tenantId?: string) {
    this.requestId = requestId;
    this.userId = userId;
    this.tenantId = tenantId;
    this.hostname = os.hostname();
  }

  private createLogEntry(level: LogLevel, message: string, meta?: Record<string, any>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
      requestId: this.requestId,
      userId: this.userId,
      tenantId: this.tenantId,
      pid: process.pid,
      hostname: this.hostname,
    };
  }

  error(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, meta);
    logger['write'](entry);
  }

  warn(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, meta);
    logger['write'](entry);
  }

  info(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, meta);
    logger['write'](entry);
  }

  debug(message: string, meta?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, meta);
    logger['write'](entry);
  }
}

// Middleware for request logging
export function createRequestLogger(requestId: string, userId?: string, tenantId?: string) {
  return new RequestContextLogger(requestId, userId, tenantId);
}

// Log aggregation utilities
export class LogAggregator {
  static aggregateMetrics(logs: LogEntry[]): Record<string, any> {
    const metrics = {
      totalLogs: logs.length,
      errorCount: logs.filter(log => log.level === LogLevel.ERROR).length,
      warnCount: logs.filter(log => log.level === LogLevel.WARN).length,
      infoCount: logs.filter(log => log.level === LogLevel.INFO).length,
      debugCount: logs.filter(log => log.level === LogLevel.DEBUG).length,
      timeRange: {
        start: logs.length > 0 ? logs[0].timestamp : null,
        end: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
      },
      topErrors: logs
        .filter(log => log.level === LogLevel.ERROR)
        .reduce((acc: Record<string, number>, log) => {
          acc[log.message] = (acc[log.message] || 0) + 1;
          return acc;
        }, {}),
    };

    return metrics;
  }
}

// Export for easy importing
export default logger;