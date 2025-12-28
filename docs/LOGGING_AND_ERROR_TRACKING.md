# Logging and Error Tracking

This document describes the logging and error tracking implementation in ARES Dashboard.

## Overview

The application uses structured logging with Sentry integration for error tracking and incident response.

## Features

- **Structured Logging**: All logs are output in JSON format for easy parsing and analysis
- **Error Tracking**: Integration with Sentry for real-time error monitoring
- **Rate Limiting**: Protection against abuse and cost overruns
- **Context-Aware**: Logs include request context (IP, user agent, method, URL)
- **Log Levels**: Support for debug, info, warn, error, and fatal levels

## Configuration

### Environment Variables

Add the following environment variables to enable Sentry:

```bash
# Sentry Configuration
ENABLE_SENTRY=true
SENTRY_DSN=your-sentry-dsn-here

# Optional: Set log level (default: info)
LOG_LEVEL=info # Options: debug, info, warn, error, fatal

# Environment
NODE_ENV=production # or development
```

### Getting a Sentry DSN

1. Sign up for a free account at [sentry.io](https://sentry.io)
2. Create a new project for Node.js
3. Copy the DSN from the project settings
4. Add it to your environment variables

## Usage

### Basic Logging

```typescript
import { logger } from '../lib/logger';

// Info logging
logger.info('User logged in', { userId: 'user123', ip: '192.168.1.1' });

// Warning logging
logger.warn('Rate limit approaching', { userId: 'user123', count: 55 });

// Error logging
logger.error('Failed to process request', error, { userId: 'user123' });

// Fatal error logging
logger.fatal('Database connection lost', error);
```

### HTTP Request Logging

```typescript
logger.logRequest(
  'POST',           // method
  '/api/users',     // url
  200,              // status code
  150,              // duration in ms
  { userId: 'user123' }  // additional context
);
```

### Error Tracking

```typescript
try {
  // Your code
} catch (error) {
  // Automatically logs and sends to Sentry
  logger.captureException(error, { 
    source: 'api',
    endpoint: '/api/users'
  });
}
```

### User Context

```typescript
// Set user context for error tracking
logger.setUser({
  id: 'user123',
  email: 'user@example.com',
  username: 'johndoe'
});

// Clear user context
logger.clearUser();
```

### Breadcrumbs

```typescript
// Add breadcrumbs for debugging
logger.addBreadcrumb('User clicked submit button', { formId: 'login' });
```

## Rate Limiting

### Default Rate Limiter

The application includes a default rate limiter that allows 60 requests per minute:

```typescript
import { limiter } from '../lib/middleware/rateLimit';

// Use in API endpoints
const middleware = compose(
  securityHeaders,
  cors(),
  requestLogger,
  limiter  // 60 requests per 60 seconds
);
```

### Custom Rate Limiting

Create custom rate limiters for specific endpoints:

```typescript
import { rateLimit } from '../lib/middleware/rateLimit';

// More restrictive rate limit for expensive operations
const strictLimiter = rateLimit({
  windowMs: 60_000,    // 1 minute
  maxRequests: 10,     // 10 requests
  message: 'Too many requests, please slow down.'
});

// More permissive for public endpoints
const publicLimiter = rateLimit({
  windowMs: 60_000,
  maxRequests: 100
});
```

### Rate Limit Headers

The rate limiter automatically sets these headers:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Timestamp when the window resets
- `Retry-After`: Seconds to wait before retrying (when rate limited)

## Error Handler Middleware

Use the error handler middleware to catch and track errors:

```typescript
import { catchAsync, errorHandler } from '../lib/middleware/errorHandler';

// Wrap async handlers
const handler = catchAsync(async (req, res) => {
  // Your async code
  const data = await someAsyncOperation();
  res.json(data);
});

// Or wrap middleware
const middleware = wrapMiddleware((req, res, next) => {
  // Your middleware code
  next();
});
```

## Log Format

All logs follow this structured format:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info",
  "message": "User logged in",
  "context": {
    "userId": "user123",
    "ip": "192.168.1.1",
    "method": "POST",
    "url": "/api/auth/login"
  }
}
```

Error logs include additional fields:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "error",
  "message": "Failed to process request",
  "context": {
    "userId": "user123"
  },
  "error": {
    "name": "Error",
    "message": "Database query failed",
    "stack": "Error: Database query failed\n    at ..."
  }
}
```

## Best Practices

1. **Use Appropriate Log Levels**
   - `debug`: Detailed diagnostic information
   - `info`: General informational messages
   - `warn`: Warning messages for potentially harmful situations
   - `error`: Error events that might still allow the application to continue
   - `fatal`: Very severe error events that will presumably lead the application to abort

2. **Include Context**
   - Always include relevant context (userId, IP, etc.) in logs
   - Use structured data (objects) rather than string concatenation

3. **Don't Log Sensitive Data**
   - Never log passwords, tokens, or other sensitive information
   - Be careful with PII (Personally Identifiable Information)

4. **Rate Limiting Strategy**
   - Apply stricter limits to expensive operations
   - Apply more permissive limits to public, read-only endpoints
   - Monitor rate limit violations to adjust thresholds

5. **Error Handling**
   - Use `catchAsync` to wrap all async route handlers
   - Let errors bubble up to the error handler
   - Provide meaningful error messages to users

## Monitoring and Alerts

### Sentry Features

- **Real-time Alerts**: Get notified immediately when errors occur
- **Error Grouping**: Similar errors are grouped together
- **Performance Monitoring**: Track request performance
- **Release Tracking**: Associate errors with specific releases
- **Source Maps**: See original source code in stack traces

### Setting Up Alerts

1. Configure alerts in Sentry dashboard
2. Set up notification channels (email, Slack, etc.)
3. Define alert rules based on error frequency or severity

## Testing

Run the logging and rate limiting tests:

```bash
# Run all tests
npm test

# Run specific test suites
npm test tests/unit/logger.test.ts
npm test tests/unit/rateLimit.test.ts
npm test tests/unit/errorHandler.test.ts
```

## Production Considerations

1. **Sentry Rate Limits**: Free tier has limits on events per month
2. **Performance**: Structured logging has minimal overhead
3. **Storage**: Consider log rotation for file-based logging
4. **Redis**: For production rate limiting with multiple instances, use Redis
5. **Log Aggregation**: Consider using a log aggregation service (e.g., LogDNA, Datadog)

## Troubleshooting

### Sentry Not Working

1. Check `ENABLE_SENTRY` is set to `true`
2. Verify `SENTRY_DSN` is correct
3. Check Sentry quota limits
4. Verify network connectivity to Sentry

### Rate Limiting Issues

1. Check IP address detection (behind proxy?)
2. Verify rate limit configuration
3. Consider using Redis for distributed rate limiting
4. Check for clock synchronization issues

### Logs Not Appearing

1. Check `LOG_LEVEL` environment variable
2. Verify log level is appropriate (e.g., debug logs won't show if level is info)
3. Check console output in serverless logs

## Enterprise Checklist

- [x] Structured logging implemented
- [x] Error tracking with Sentry
- [x] Rate limiting on all endpoints
- [x] Context-aware logging
- [x] Error handler middleware
- [x] Comprehensive tests
- [x] Documentation
- [x] Incident response ready

## Further Reading

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Best Practices for Logging](https://www.loggly.com/blog/logging-best-practices/)
- [Rate Limiting Strategies](https://www.nginx.com/blog/rate-limiting-nginx/)
