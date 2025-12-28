/**
 * Structured logging utility with Sentry integration
 * Provides consistent logging format and error tracking across the application
 */

import * as Sentry from '@sentry/node';

// Log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Log context interface
export interface LogContext {
  [key: string]: unknown;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  ip?: string;
  method?: string;
  url?: string;
  userAgent?: string;
}

// Structured log entry
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// Logger configuration
interface LoggerConfig {
  enableSentry: boolean;
  sentryDsn?: string;
  environment: string;
  minLogLevel: LogLevel;
}

// Log level priorities
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

class Logger {
  private config: LoggerConfig;
  private sentryInitialized = false;

  constructor() {
    this.config = {
      enableSentry: process.env.ENABLE_SENTRY === 'true',
      sentryDsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      minLogLevel: (process.env.LOG_LEVEL as LogLevel) || 'info',
    };

    this.initializeSentry();
  }

  private initializeSentry(): void {
    if (this.config.enableSentry && this.config.sentryDsn) {
      try {
        Sentry.init({
          dsn: this.config.sentryDsn,
          environment: this.config.environment,
          tracesSampleRate: this.config.environment === 'production' ? 0.1 : 1.0,
          // Performance monitoring - enabled
          // Session replay for error context
          integrations: [
            Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
          ],
        });
        this.sentryInitialized = true;
        this.info('Sentry initialized successfully', {
          environment: this.config.environment,
        });
      } catch (error) {
        console.error('Failed to initialize Sentry:', error);
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLogLevel];
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };
  }

  private writeLog(entry: LogEntry): void {
    // Output structured log as JSON
    const logString = JSON.stringify(entry);

    switch (entry.level) {
      case 'debug':
      case 'info':
        console.log(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      case 'error':
      case 'fatal':
        console.error(logString);
        break;
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    const entry = this.formatLog('debug', message, context);
    this.writeLog(entry);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    const entry = this.formatLog('info', message, context);
    this.writeLog(entry);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    if (!this.shouldLog('warn')) return;
    const entry = this.formatLog('warn', message, context);
    this.writeLog(entry);

    // Send to Sentry as breadcrumb
    if (this.sentryInitialized) {
      Sentry.addBreadcrumb({
        level: 'warning',
        message,
        data: context,
      });
    }
  }

  /**
   * Log error message and send to Sentry
   */
  error(message: string, error?: Error, context?: LogContext): void {
    if (!this.shouldLog('error')) return;

    const entry = this.formatLog('error', message, context);
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    this.writeLog(entry);

    // Send to Sentry
    if (this.sentryInitialized) {
      if (context) {
        Sentry.setContext('additional', context);
      }
      if (error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(message, 'error');
      }
    }
  }

  /**
   * Log fatal error and send to Sentry
   */
  fatal(message: string, error?: Error, context?: LogContext): void {
    const entry = this.formatLog('fatal', message, context);
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }
    this.writeLog(entry);

    // Send to Sentry with fatal level
    if (this.sentryInitialized) {
      if (context) {
        Sentry.setContext('additional', context);
      }
      if (error) {
        Sentry.captureException(error, { level: 'fatal' });
      } else {
        Sentry.captureMessage(message, 'fatal');
      }
    }
  }

  /**
   * Log HTTP request
   */
  logRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    context?: LogContext
  ): void {
    this.info(`${method} ${url} ${statusCode} ${duration}ms`, {
      ...context,
      method,
      url,
      statusCode,
      duration,
    });
  }

  /**
   * Capture exception and send to Sentry
   */
  captureException(error: Error, context?: LogContext): void {
    this.error(error.message, error, context);
  }

  /**
   * Set user context for error tracking
   */
  setUser(user: { id: string; email?: string; username?: string }): void {
    if (this.sentryInitialized) {
      Sentry.setUser(user);
    }
  }

  /**
   * Clear user context
   */
  clearUser(): void {
    if (this.sentryInitialized) {
      Sentry.setUser(null);
    }
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(message: string, data?: Record<string, unknown>): void {
    if (this.sentryInitialized) {
      Sentry.addBreadcrumb({
        message,
        data,
      });
    }
  }

  /**
   * Flush pending Sentry events (useful for serverless)
   */
  async flush(timeout = 2000): Promise<boolean> {
    if (this.sentryInitialized) {
      return await Sentry.flush(timeout);
    }
    return true;
  }
}

// Export singleton instance
export const logger = new Logger();

// Export Sentry for direct access when needed
export { Sentry };
