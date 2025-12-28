# Audit Logging and Data Retention Guide

This document explains how to use the audit logging and data retention features in the ARES Dashboard.

## Overview

The ARES Dashboard implements comprehensive audit logging and data retention controls to meet SOC2 compliance requirements and privacy regulations. All sensitive actions are logged immutably on the server side, providing forensics-ready evidence.

## Features

### 1. Audit Logging

Every sensitive action in the system is automatically logged with:
- **Actor ID**: User who performed the action
- **Action Type**: What was done (e.g., `campaign_created`, `export_campaigns`, `ai_generated`, `permission_denied`)
- **Target**: Entity affected (e.g., campaign ID, resource name)
- **Details**: Additional context (JSON format)
- **IP Address**: Source IP of the request
- **User Agent**: Browser/client information
- **Timestamp**: When the action occurred

#### Logged Actions

The following actions are automatically logged:

1. **Campaign Operations**
   - `campaign_created` - When a new campaign is created
   - `campaign_updated` - When a campaign is modified
   - `campaign_deleted` - When a campaign is removed
   - `export_campaigns` - When campaigns are exported

2. **AI Generation**
   - `ai_generated` - When AI is used to generate tactic details

3. **Permission Failures**
   - `permission_denied` - When access is denied due to insufficient permissions
   - Includes role checks, permission checks, and organization access

4. **Data Management**
   - `retention_stats_viewed` - When audit retention statistics are accessed
   - `audit_cleanup_executed` - When old audit logs are cleaned up

### 2. Data Retention Controls

#### Configuration

Add these environment variables to your `.env` file:

```bash
# Audit log retention period in days (default: 365 for SOC2 compliance)
# Set to 0 to keep logs indefinitely
AUDIT_RETENTION_DAYS=365

# Prompt storage opt-in (default: false for privacy)
# When false, AI prompts and responses are not persisted to database
# When true, prompts are stored for audit and training purposes
PROMPT_STORAGE=false
```

#### Retention Policy

- **Default**: 365 days (1 year) - SOC2 compliant
- **Indefinite**: Set `AUDIT_RETENTION_DAYS=0` to keep all logs forever
- **Custom**: Set any number of days based on your compliance requirements

#### Prompt Storage

By default, AI prompts and responses are **NOT** stored in the database for privacy reasons. Only metadata (tactic ID, framework, etc.) is logged to the audit trail.

To enable prompt storage for training or audit purposes:
```bash
PROMPT_STORAGE=true
```

### 3. API Endpoints

#### Export Campaigns

**Endpoint**: `GET /api/export-campaigns`

**Authentication**: Required

**Description**: Export all campaigns for the authenticated user as JSON.

**Response**:
```json
[
  {
    "id": "campaign_123",
    "name": "Example Campaign",
    "framework": "OWASP",
    "tacticId": "LLM01",
    ...
  }
]
```

**Audit Log**: Automatically creates an `export_campaigns` audit entry.

#### Data Retention Management

**Endpoint**: `GET /api/data-retention`

**Authentication**: Required (Admin only)

**Description**: Get audit log retention statistics.

**Response**:
```json
{
  "retentionDays": 365,
  "cutoffDate": "2024-01-01T00:00:00.000Z",
  "totalLogs": 10000,
  "oldLogs": 500,
  "retainedLogs": 9500
}
```

---

**Endpoint**: `POST /api/data-retention`

**Authentication**: Required (Admin only)

**Description**: Trigger cleanup of old audit logs based on retention policy.

**Request Body**:
```json
{
  "action": "cleanup"
}
```

**Response**:
```json
{
  "message": "Audit log cleanup completed",
  "deletedCount": 500
}
```

**Audit Log**: Automatically creates an `audit_cleanup_executed` audit entry.

## Usage Examples

### Using the Audit Helper (Backend)

```typescript
import { audit, auditFromRequest } from '../utils/audit';

// Basic audit logging
await audit(
  'user_123',           // Actor ID
  'custom_action',      // Action type
  'resource_456',       // Target resource
  { key: 'value' }      // Optional details
);

// Audit logging with request context (automatically extracts IP and User-Agent)
await auditFromRequest(
  req,                  // Express/Vercel request object
  req.user.userId,      // Actor ID
  'export_data',        // Action type
  'campaigns',          // Target resource
  { format: 'json' }    // Optional details
);
```

### Checking Retention Configuration

```typescript
import { getAuditRetentionDays, isPromptStorageEnabled } from '../utils/dataRetention';

// Get configured retention period
const retentionDays = getAuditRetentionDays(); // 365 (or configured value)

// Check if prompt storage is enabled
const promptStorage = isPromptStorageEnabled(); // false (default)
```

### Cleaning Up Old Audit Logs

```typescript
import { cleanupAuditLogs } from '../utils/dataRetention';

// Trigger cleanup (typically run as a scheduled job)
const deletedCount = await cleanupAuditLogs();
console.log(`Deleted ${deletedCount} old audit logs`);
```

## Scheduled Cleanup

To automatically clean up old audit logs, set up a scheduled job (e.g., using cron or a serverless scheduler):

```bash
# Example: Daily cleanup at 2 AM
0 2 * * * curl -X POST https://your-domain.com/api/data-retention \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "cleanup"}'
```

## Viewing Audit Logs

Audit logs are stored in the `audit_logs` table and can be queried through the API:

**Endpoint**: `GET /api/audit-logs`

**Query Parameters**:
- `actorId`: Filter by user ID
- `action`: Filter by action type
- `startDate`: Filter by start date (ISO 8601)
- `endDate`: Filter by end date (ISO 8601)
- `skip`: Pagination offset
- `take`: Number of results per page

**Example**:
```bash
GET /api/audit-logs?actorId=user_123&action=campaign_created&take=50
```

## Security Considerations

1. **Immutable Logs**: Audit logs cannot be edited or deleted through the API (except for retention cleanup)
2. **Server-Side Only**: All audit logging happens on the server; client-side code cannot manipulate logs
3. **Authentication Required**: All audit endpoints require proper authentication
4. **Role-Based Access**: Only admins can trigger manual cleanup or view retention statistics
5. **IP Tracking**: All actions are logged with source IP for forensics
6. **Graceful Failures**: Audit logging failures don't break operations but are logged to console

## SOC2 Compliance

This implementation provides the following SOC2 controls:

- **CC6.1**: Logging and monitoring of all sensitive actions
- **CC6.2**: Retention of audit logs for forensic analysis
- **CC6.3**: Protection of audit logs from unauthorized modification
- **CC7.1**: Tracking of who did what, when, and from where
- **PI1.3**: Privacy-aligned with opt-in prompt storage

## Privacy Compliance

- **GDPR Compliant**: Configurable data retention periods
- **Privacy by Default**: Prompt storage is opt-out by default
- **Right to Deletion**: Audit logs can be deleted after retention period
- **Data Minimization**: Only necessary information is logged

## Troubleshooting

### Audit logging not working

1. Check that the database is properly configured
2. Ensure the `AuditLog` model exists in Prisma schema
3. Verify Prisma client is generated: `npm run db:generate`
4. Check server logs for audit logging errors

### Cleanup not deleting logs

1. Verify `AUDIT_RETENTION_DAYS` is set correctly
2. Ensure retention period has passed (logs must be older than retention period)
3. Check that you have admin permissions to trigger cleanup
4. Review server logs for cleanup errors

### Export endpoint returns 401

1. Ensure you're authenticated (provide valid JWT token)
2. Check that the `Authorization` header is set correctly: `Bearer <token>`
3. Verify your access token hasn't expired

## Best Practices

1. **Regular Cleanup**: Schedule automatic cleanup to prevent database bloat
2. **Monitor Retention**: Regularly check retention statistics to ensure proper cleanup
3. **Secure Admin Access**: Limit who can trigger manual cleanup operations
4. **Backup Logs**: Consider backing up audit logs before automatic cleanup
5. **Review Logs**: Regularly review audit logs for suspicious activity
6. **Test Retention**: Test retention cleanup in staging before production
7. **Document Actions**: Use descriptive action names and include relevant details

## Support

For issues or questions about audit logging and data retention:
- Review the logs in `/api/audit-logs`
- Check server console for error messages
- Verify environment configuration
- Contact your system administrator
