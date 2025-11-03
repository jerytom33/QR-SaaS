/**
 * 12-Factor App: Factor VI - Processes
 * Execute as stateless processes
 */

import { NextRequest } from 'next/server';
import { config } from '@/lib/config';

// Process state interface
interface ProcessState {
  pid: number;
  startTime: Date;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  requestCount: number;
  errorCount: number;
  lastActivity: Date;
}

// Stateless process manager
export class ProcessManager {
  private static instance: ProcessManager;
  private state: ProcessState;
  private requestCounter = 0;
  private errorCounter = 0;

  private constructor() {
    this.state = {
      pid: process.pid,
      startTime: new Date(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      requestCount: 0,
      errorCount: 0,
      lastActivity: new Date(),
    };

    // Monitor process health
    this.startHealthMonitoring();
  }

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  // Track request start
  startRequest(requestId: string): { requestId: string; startTime: Date } {
    this.requestCounter++;
    this.state.requestCount = this.requestCounter;
    this.state.lastActivity = new Date();

    return {
      requestId,
      startTime: new Date(),
    };
  }

  // Track request completion
  endRequest(requestId: string, startTime: Date, error?: Error): void {
    const duration = Date.now() - startTime.getTime();
    
    if (error) {
      this.errorCounter++;
      this.state.errorCount = this.errorCounter;
    }

    // Log request metrics (in production, send to monitoring service)
    if (config.NODE_ENV === 'production') {
      console.log(JSON.stringify({
        type: 'request_metrics',
        requestId,
        duration,
        success: !error,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  // Get current process state
  getState(): ProcessState {
    return {
      ...this.state,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };
  }

  // Health check
  isHealthy(): boolean {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal + memUsage.external;
    const maxMemory = 1024 * 1024 * 1024; // 1GB limit

    // Check memory usage
    if (totalMemory > maxMemory) {
      return false;
    }

    // Check error rate (if more than 10% of requests fail, mark as unhealthy)
    if (this.requestCounter > 100) {
      const errorRate = this.errorCounter / this.requestCounter;
      if (errorRate > 0.1) {
        return false;
      }
    }

    return true;
  }

  // Graceful shutdown
  async shutdown(timeout: number = 30000): Promise<void> {
    console.log('🔄 Starting graceful shutdown...');
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.log('⚠️  Shutdown timeout, forcing exit');
        reject(new Error('Shutdown timeout'));
      }, timeout);

      // Stop accepting new requests
      console.log('🛑 Stopping new requests...');
      
      // Wait for existing requests to complete (simplified)
      setTimeout(() => {
        clearTimeout(timeoutId);
        console.log('✅ Graceful shutdown completed');
        resolve();
      }, 1000);
    });
  }

  // Start health monitoring
  private startHealthMonitoring(): void {
    setInterval(() => {
      const state = this.getState();
      
      // Log process metrics
      if (config.NODE_ENV === 'production') {
        console.log(JSON.stringify({
          type: 'process_metrics',
          pid: state.pid,
          uptime: Date.now() - state.startTime.getTime(),
          memoryUsage: state.memoryUsage,
          requestCount: state.requestCount,
          errorCount: state.errorCount,
          timestamp: new Date().toISOString(),
        }));
      }

      // Check if process is healthy
      if (!this.isHealthy()) {
        console.error('❌ Process is unhealthy, considering restart');
      }
    }, 60000); // Every minute
  }
}

// Export singleton instance
export const processManager = ProcessManager.getInstance();

// Middleware for tracking requests
export function withProcessTracking(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { startTime } = processManager.startRequest(requestId);

    try {
      const response = await handler(req);
      processManager.endRequest(requestId, startTime);
      return response;
    } catch (error) {
      processManager.endRequest(requestId, startTime, error as Error);
      throw error;
    }
  };
}

// Process lifecycle management
export class ProcessLifecycle {
  static setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`📡 Received ${signal}, starting graceful shutdown...`);
      
      try {
        await processManager.shutdown();
        process.exit(0);
      } catch (error) {
        console.error('❌ Graceful shutdown failed:', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Nodemon restart

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  static setupProcessMonitoring(): void {
    // Monitor memory usage
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      if (usedMB > 500) { // 500MB warning threshold
        console.warn(`⚠️  High memory usage: ${usedMB}MB / ${totalMB}MB`);
      }
    }, 30000); // Every 30 seconds

    // Monitor event loop lag
    setInterval(() => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        if (lag > 100) { // 100ms warning threshold
          console.warn(`⚠️  High event loop lag: ${lag}ms`);
        }
      });
    }, 10000); // Every 10 seconds
  }
}

// Initialize process lifecycle
ProcessLifecycle.setupGracefulShutdown();
ProcessLifecycle.setupProcessMonitoring();

// Export for easy importing
export default processManager;