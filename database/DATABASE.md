# Database Setup Guide

## Overview

ARES Dashboard supports enterprise-grade persistence using PostgreSQL for production deployments. This guide covers database setup, migrations, and best practices.

## Current State

- **Development**: Uses localStorage for rapid prototyping
- **Production Ready**: PostgreSQL schema provided for enterprise deployment

## PostgreSQL Setup

### Prerequisites

- PostgreSQL 14 or higher
- Database connection with appropriate permissions
- (Optional) Redis for caching and session storage

### Quick Start

#### 1. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE ares_dashboard;

# Create user (if needed)
CREATE USER ares_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE ares_dashboard TO ares_user;
```

#### 2. Apply Schema

```bash
# Apply the schema
psql -U ares_user -d ares_dashboard -f database/schema/postgresql.sql
```

#### 3. Configure Environment

Create or update your `.env` file:

```bash
# Database Configuration
DATABASE_URL=postgresql://ares_user:secure_password@localhost:5432/ares_dashboard

# Connection Pool Settings
DB_POOL_MIN=2
DB_POOL_MAX=10

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# OAuth Configuration (when implementing)
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret

AZURE_AD_TENANT_ID=your_tenant_id
AZURE_AD_CLIENT_ID=your_client_id
AZURE_AD_CLIENT_SECRET=your_client_secret

OKTA_DOMAIN=your-domain.okta.com
OKTA_CLIENT_ID=your_client_id
OKTA_CLIENT_SECRET=your_client_secret
```

## Schema Overview

### Tables

#### Core Tables

- **organizations**: Multi-tenant organization data
- **users**: User accounts with RBAC
- **sessions**: Active sessions and JWT tokens
- **oauth_providers**: OAuth integration data

#### Campaign Management

- **campaigns**: Security testing campaigns
- **campaign_vectors**: Attack vectors
- **campaign_payloads**: Test payloads
- **campaign_permissions**: Sharing permissions

#### Collaboration

- **workspaces**: Team workspaces
- **workspace_members**: Membership data

#### Compliance

- **audit_logs**: Comprehensive audit trail

### Key Features

1. **Multi-tenancy**: Organization-based isolation
2. **RBAC**: Four role levels (admin, red_team_lead, analyst, viewer)
3. **OAuth Support**: Auth0, Azure AD, Okta, Google, GitHub
4. **Audit Logging**: Full compliance trail
5. **Campaign Sharing**: Granular permissions

## Migrations

### Creating Migrations

For schema changes, create timestamped migration files:

```bash
# Create new migration
mkdir -p database/migrations
touch database/migrations/$(date +%Y%m%d%H%M%S)_add_feature.sql
```

### Migration Template

```sql
-- Migration: [Description]
-- Created: [Date]

BEGIN;

-- Up Migration
-- Add your schema changes here

-- Example: Add new column
-- ALTER TABLE campaigns ADD COLUMN status VARCHAR(50) DEFAULT 'draft';

COMMIT;
```

### Rollback Template

```sql
-- Rollback: [Description]

BEGIN;

-- Down Migration
-- Reverse your schema changes here

-- Example: Remove column
-- ALTER TABLE campaigns DROP COLUMN status;

COMMIT;
```

## Connection Pooling

### Using pg (Node.js)

Install dependencies:

```bash
npm install pg
```

Create connection pool:

```typescript
// database/connection.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_POOL_MIN || '2'),
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error', err);
  process.exit(-1);
});

export default pool;
```

### Query Helper

```typescript
// database/query.ts
import pool from './connection';

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  
  console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
}

export async function getClient() {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Set a timeout of 5 seconds
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  client.release = () => {
    clearTimeout(timeout);
    client.release = release;
    return release();
  };
  
  return client;
}
```

## Data Access Layer

### Example: User Repository

```typescript
// repositories/userRepository.ts
import { query } from '../database/query';
import type { User } from '../types/auth';

export class UserRepository {
  static async findById(id: string): Promise<User | null> {
    const result = await query(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByEmail(organizationId: string, email: string): Promise<User | null> {
    const result = await query(
      'SELECT * FROM users WHERE organization_id = $1 AND email = $2 AND is_active = true',
      [organizationId, email]
    );
    return result.rows[0] || null;
  }

  static async create(userData: Partial<User>): Promise<User> {
    const result = await query(
      `INSERT INTO users (organization_id, email, name, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userData.organization_id,
        userData.email,
        userData.name,
        userData.role,
        userData.password_hash
      ]
    );
    return result.rows[0];
  }

  static async updateLastLogin(userId: string): Promise<void> {
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  }
}
```

### Example: Campaign Repository

```typescript
// repositories/campaignRepository.ts
import { query } from '../database/query';

export class CampaignRepository {
  static async findByOrganization(organizationId: string) {
    const result = await query(
      `SELECT c.*, u.name as creator_name
       FROM campaigns c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.organization_id = $1 AND c.is_archived = false
       ORDER BY c.created_at DESC`,
      [organizationId]
    );
    return result.rows;
  }

  static async create(campaignData: any) {
    const result = await query(
      `INSERT INTO campaigns (
        organization_id, created_by, name, description,
        framework, tactic_id, tactic_name, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        campaignData.organization_id,
        campaignData.created_by,
        campaignData.name,
        campaignData.description,
        campaignData.framework,
        campaignData.tactic_id,
        campaignData.tactic_name,
        JSON.stringify(campaignData.metadata)
      ]
    );
    return result.rows[0];
  }

  static async checkPermission(campaignId: string, userId: string, permission: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM campaign_permissions
       WHERE campaign_id = $1 AND user_id = $2 AND permission = $3`,
      [campaignId, userId, permission]
    );
    return result.rowCount > 0;
  }
}
```

## Backup and Recovery

### Automated Backups

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/var/backups/ares"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ares_backup_$TIMESTAMP.sql"

# Create backup
pg_dump -U ares_user -d ares_dashboard -F c -f "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
```

### Restore from Backup

```bash
# Restore from compressed backup
gunzip ares_backup_20240115_120000.sql.gz
pg_restore -U ares_user -d ares_dashboard -c ares_backup_20240115_120000.sql
```

## Performance Optimization

### Indexes

The schema includes optimized indexes for:
- User lookups by email and organization
- Session validation
- Campaign queries
- Audit log searches

### Query Optimization Tips

1. **Use prepared statements** for repeated queries
2. **Limit result sets** with pagination
3. **Use connection pooling** to reduce overhead
4. **Enable query logging** in development
5. **Monitor slow queries** with pg_stat_statements

### Connection Pooling Best Practices

```typescript
// Good: Use connection pool
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// Better: Use transactions for multiple operations
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO campaigns ...');
  await client.query('INSERT INTO campaign_vectors ...');
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

## Redis Integration (Optional)

### Session Storage

```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL
});

redis.on('error', (err) => console.error('Redis Client Error', err));

await redis.connect();

// Store session
await redis.setEx(`session:${token}`, 86400, JSON.stringify(sessionData));

// Get session
const session = await redis.get(`session:${token}`);

// Delete session
await redis.del(`session:${token}`);
```

### Caching

```typescript
// Cache campaign data
await redis.setEx(
  `campaign:${campaignId}`,
  3600, // 1 hour
  JSON.stringify(campaignData)
);

// Invalidate on update
await redis.del(`campaign:${campaignId}`);
```

## Security Considerations

1. **Use environment variables** for credentials
2. **Enable SSL/TLS** for database connections
3. **Implement row-level security** for multi-tenancy
4. **Regularly update** PostgreSQL and dependencies
5. **Monitor for SQL injection** attempts
6. **Encrypt sensitive data** at rest and in transit
7. **Audit database access** logs

## Monitoring

### Metrics to Track

- Connection pool usage
- Query performance
- Database size growth
- Index usage
- Slow queries
- Error rates

### Recommended Tools

- **pg_stat_statements**: Query performance
- **pgAdmin**: Database management
- **DataDog**: Application monitoring
- **Sentry**: Error tracking

## Compliance

### Audit Logging

The audit_logs table tracks:
- User actions (login, logout, create, update, delete)
- Resource access
- IP addresses and user agents
- Timestamps

### Data Retention

```sql
-- Delete old audit logs (keep 2 years)
DELETE FROM audit_logs
WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '2 years';

-- Archive old campaigns
UPDATE campaigns
SET is_archived = true
WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '1 year';
```

### GDPR Compliance

```sql
-- Delete user data (right to be forgotten)
DELETE FROM audit_logs WHERE user_id = 'user-uuid';
DELETE FROM campaign_permissions WHERE user_id = 'user-uuid';
DELETE FROM workspace_members WHERE user_id = 'user-uuid';
UPDATE campaigns SET created_by = NULL WHERE created_by = 'user-uuid';
DELETE FROM users WHERE id = 'user-uuid';
```

## Migration from localStorage

To migrate from localStorage to PostgreSQL:

1. Export data from localStorage
2. Transform to match database schema
3. Import using bulk insert
4. Verify data integrity
5. Update application configuration
6. Test thoroughly before production

Example migration script:

```typescript
// migrations/migrate-from-localstorage.ts
import { query } from '../database/query';

async function migrateFromLocalStorage() {
  // Get data from localStorage export
  const campaigns = JSON.parse(localStorage.getItem('ares_campaigns') || '[]');
  
  for (const campaign of campaigns) {
    await query(
      `INSERT INTO campaigns (name, framework, tactic_id, tactic_name, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaign.name, campaign.framework, campaign.tacticId, campaign.tacticName, campaign.metadata, userId]
    );
  }
  
  console.log(`Migrated ${campaigns.length} campaigns`);
}
```

## Troubleshooting

### Common Issues

**Connection refused**
```bash
# Check PostgreSQL is running
systemctl status postgresql

# Check connection string
echo $DATABASE_URL
```

**Too many connections**
```sql
-- Check current connections
SELECT count(*) FROM pg_stat_activity;

-- Increase max_connections (restart required)
ALTER SYSTEM SET max_connections = 200;
```

**Slow queries**
```sql
-- Enable query logging
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1s

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM campaigns WHERE organization_id = 'xxx';
```

## Next Steps

1. Set up PostgreSQL database
2. Apply schema
3. Configure environment variables
4. Implement data access layer
5. Update API endpoints to use database
6. Set up backups
7. Configure monitoring
8. Test thoroughly

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [node-postgres Documentation](https://node-postgres.com/)
- [Redis Documentation](https://redis.io/documentation)
- [Database Security Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html)
