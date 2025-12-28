import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../../lib/logger';

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock console methods
    consoleLogSpy = vi.fn();
    consoleWarnSpy = vi.fn();
    consoleErrorSpy = vi.fn();
    
    console.log = consoleLogSpy as unknown as typeof console.log;
    console.warn = consoleWarnSpy as unknown as typeof console.warn;
    console.error = consoleErrorSpy as unknown as typeof console.error;
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    vi.clearAllMocks();
  });

  describe('debug()', () => {
    it('should not log debug message when log level is info (default)', () => {
      // By default, debug logs are not shown
      logger.debug('Test debug message', { userId: 'user123' });

      // Console.log should not have been called at debug level
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log info and above even when debug is called', () => {
      // Info level logs should work
      logger.info('Test info message');
      expect(consoleLogSpy).toHaveBeenCalledOnce();
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.level).toBe('info');
    });
  });

  describe('info()', () => {
    it('should log info message with structured format', () => {
      logger.info('Test info message', { action: 'login' });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'Test info message',
        context: { action: 'login' },
      });
    });
  });

  describe('warn()', () => {
    it('should log warning message', () => {
      logger.warn('Test warning message', { reason: 'rate_limit' });

      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const logEntry = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      
      expect(logEntry).toMatchObject({
        level: 'warn',
        message: 'Test warning message',
        context: { reason: 'rate_limit' },
      });
    });
  });

  describe('error()', () => {
    it('should log error message with error object', () => {
      const error = new Error('Test error');
      logger.error('Test error message', error, { userId: 'user123' });

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry).toMatchObject({
        level: 'error',
        message: 'Test error message',
        context: { userId: 'user123' },
      });
      expect(logEntry.error).toBeDefined();
      expect(logEntry.error.name).toBe('Error');
      expect(logEntry.error.message).toBe('Test error');
      expect(logEntry.error.stack).toBeDefined();
    });

    it('should log error message without error object', () => {
      logger.error('Simple error message');

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.message).toBe('Simple error message');
      expect(logEntry.error).toBeUndefined();
    });
  });

  describe('fatal()', () => {
    it('should log fatal error', () => {
      const error = new Error('Fatal error');
      logger.fatal('Critical failure', error);

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry).toMatchObject({
        level: 'fatal',
        message: 'Critical failure',
      });
      expect(logEntry.error).toBeDefined();
    });
  });

  describe('logRequest()', () => {
    it('should log HTTP request with details', () => {
      logger.logRequest('POST', '/api/users', 200, 150, { 
        userId: 'user123',
        ip: '127.0.0.1' 
      });

      expect(consoleLogSpy).toHaveBeenCalledOnce();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      
      expect(logEntry.message).toBe('POST /api/users 200 150ms');
      expect(logEntry.context).toMatchObject({
        method: 'POST',
        url: '/api/users',
        statusCode: 200,
        duration: 150,
        userId: 'user123',
        ip: '127.0.0.1',
      });
    });
  });

  describe('captureException()', () => {
    it('should capture and log exception', () => {
      const error = new Error('Caught exception');
      logger.captureException(error, { source: 'api' });

      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const logEntry = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      
      expect(logEntry.message).toBe('Caught exception');
      expect(logEntry.error).toBeDefined();
      expect(logEntry.context).toMatchObject({ source: 'api' });
    });
  });

  describe('Structured log format', () => {
    it('should always include timestamp', () => {
      logger.info('Test message');

      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.timestamp).toBeDefined();
      expect(new Date(logEntry.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should produce valid JSON', () => {
      logger.info('Test message', { key: 'value', nested: { prop: 123 } });

      const logString = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(logString)).not.toThrow();
    });
  });
});
