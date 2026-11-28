# Database Setup Guide

## Overview

ARES Dashboard supports enterprise-grade persistence using PostgreSQL for production deployments. This guide covers database setup, migrations, and best practices.

## Current State

- **Primary Persistence**: PostgreSQL (with `pgvector` extension) managed via Prisma ORM (`prisma/schema.prisma` and `prisma/migrations/`)
- **Demo / Offline Fallback**: Browser `localStorage` fallback when backend persistence is unavailable

## PostgreSQL Setup

### Prerequisites

- PostgreSQL 14 or higher with the `pgvector` extension installed
- Node.js `^24.15.0` and Prisma CLI (`npx prisma`)
- Database connection with appropriate permissions

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

#### 2. Apply Schema (Authoritative Prisma Migrations)

Schema deployment is managed through Prisma migrations (`prisma/schema.prisma` and `prisma/migrations/`), **not** `database/schema/postgresql.sql`:

```bash
# Apply all committed Prisma migrations
npx prisma migrate deploy

# Generate the Prisma Client
npm run db:generate
```

#### 3. Configure Environment

Create or update your `.env` file:

```bash
# Database Configuration
DATABASE_URL=postgresql://ares_user:secure_password@localhost:5432/ares_dashboard

# Auth0 OAuth2/OIDC Configuration
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_CALLBACK_URL=https://your-domain.com/api/auth/callback?provider=auth0
```

## Schema Overview

The authoritative schema is defined in `prisma/schema.prisma`.

### Tables

#### Core & Identity

- **organizations**: Multi-tenant organization records (`id`, `name`, `createdBy`)
- **organization_invitations**: Hashed invitation tokens (`tokenHash`), `orgId`, `invitedEmail`, `role`, `expiresAt`, `usedAt`, `usedBy`
- **users**: User accounts (`id`, `email`, `emailVerified`, `auth0Sub`, `name`, `role`, `orgId`, `lastLogin`, `disabledAt`)

#### Campaign & Audit

- **campaigns**: Security testing campaigns (`id`, `name`, `description`, `framework`, `tacticId`, `tacticName`, `createdBy`, `selectedVectors`, `selectedPayloadIndices`, `metadata`)
- **audit_logs**: Append-only compliance audit trail (`id`, `orgId`, `actorId`, `action`, `target`, `details`, `ipAddress`, `userAgent`, `timestamp`)

#### Generation Jobs, Credits & Prompt Vault

- **generation_jobs**: Persistent tactic generation jobs (`status`, `requestedCount`, `acceptedCount`, `reservedCredits`, `workerLeaseId`, `idempotencyKey`)
- **candidate_attempts**: Per-attempt generation, originality rejection, and evaluator audit records
- **user_credit_balances** & **credit_transactions**: Credit balance (`availableTokens`, `reservedTokens`) and idempotent ledger
- **global_prompt_registry**: Deduplicated prompt registry with `pgvector` embeddings (`embeddingVector`)
- **customer_prompt_vault** & **duplicate_reports**: User-acquired vault items and duplicate investigation reports

### Key Features

1. **Multi-tenancy**: Application-level `orgId` isolation enforced across API handlers and repositories
2. **RBAC**: Four role levels (`admin`, `red_team_lead`, `analyst`, `viewer`)
3. **OAuth2/OIDC Support**: Auth0 (`auth0Sub` mapping); SAML 2.0 is disabled in this release (`501 Not Implemented`)
4. **Audit Logging**: Append-only `audit_logs` protected by PostgreSQL triggers (`audit_logs_immutable`, `audit_logs_no_truncate`)

## Migrations

Schema changes are managed exclusively through Prisma Migrate (`prisma/schema.prisma` and `prisma/migrations/`):

```bash
# Development: create and apply a new migration
npx prisma migrate dev --name add_feature

# Production / CI: apply committed migrations
npx prisma migrate deploy

# Regenerate Prisma Client after schema changes
npm run db:generate
```

## Connection Pooling & Prisma Client

ARES uses the Prisma Client singleton in `utils/db.ts` backed by `@prisma/adapter-pg` / `pg` connection pooling configured via `DATABASE_URL`:

```typescript
// utils/db.ts (singleton pattern)
import prisma from '../utils/db';

const users = await prisma.user.findMany({
  where: { orgId, disabledAt: null },
});
```

## Data Access Layer

### Example: User Repository

```typescript
// repositories/userRepository.ts
import prisma from '../utils/db';

export class UserRepository {
  static async findByIdInOrg(id: string, orgId: string) {
    return prisma.user.findFirst({
      where: { id, orgId, disabledAt: null },
    });
  }

  static async findByEmailInOrg(email: string, orgId: string) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase(), orgId, disabledAt: null },
    });
  }

  static async updateLastLogin(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  }
}
```

### Example: Campaign Repository

```typescript
// repositories/campaignRepository.ts
import prisma from '../utils/db';

export class CampaignRepository {
  static async findAll(options: { skip?: number; take?: number; orgId: string }) {
    return prisma.campaign.findMany({
      where: { creator: { orgId: options.orgId } },
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
    });
  }

  static async create(data: {
    name: string;
    description?: string;
    framework: string;
    tacticId: string;
    tacticName: string;
    createdBy: string;
    selectedVectors?: string[];
    selectedPayloadIndices?: number[];
  }) {
    return prisma.campaign.create({ data });
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

The Prisma schema (`prisma/schema.prisma`) includes indexes for:
- User lookups by `email` and `orgId`
- Campaign queries by `createdBy` and `createdAt`
- Audit log searches by `actorId`, `(orgId, timestamp)`, `timestamp`, and `action`
- Generation job leases and user job history (`(status, leaseExpiresAt)`, `(userId, createdAt)`)

### Query Optimization Tips

1. **Use parameterized Prisma queries** for type safety and SQL injection prevention
2. **Limit result sets** with `skip` / `take` pagination
3. **Use Prisma `$transaction`** for atomic multi-step mutations
4. **Monitor slow queries** with `pg_stat_statements`

### Transaction Best Practices

```typescript
// Use Prisma transactions for atomic multi-table operations
await prisma.$transaction(async (tx) => {
  const campaign = await tx.campaign.create({ data: campaignData });
  await tx.auditLog.create({ data: auditData });
  return campaign;
});
```

## Security Considerations

1. **Use environment variables** for credentials
2. **Enable SSL/TLS** for database connections
3. **Enforce application-level `orgId` isolation** across all API handlers and database queries (PostgreSQL Row-Level Security is not enabled in the Prisma schema; multi-tenancy is enforced at the application layer)
4. **Use a non-owner, non-superuser runtime database role** so append-only triggers on `audit_logs` cannot be bypassed
5. **Regularly update** PostgreSQL and dependencies
6. **Monitor for SQL injection** attempts
7. **Encrypt sensitive data** at rest and in transit
8. **Audit database access** logs

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

The `audit_logs` table tracks:
- User actions (`login`, `logout`, `create`, `update`, `delete`, etc.)
- Resource targets (`target`), organization (`orgId`), and actor (`actorId`)
- IP addresses (`ipAddress`) and user agents (`userAgent`)
- Timestamps (`timestamp`)

`audit_logs` is **append-only** at the database layer via two PostgreSQL triggers:
- `audit_logs_immutable`: blocks `UPDATE` and `DELETE` operations on `audit_logs`.
- `audit_logs_no_truncate`: blocks `TRUNCATE` operations on `audit_logs`.

Run the application with a **non-owner, non-superuser** PostgreSQL role so these triggers cannot be disabled or bypassed at runtime.

```sql
-- Query audit logs by actor and organization
SELECT id, "orgId", "actorId", action, target, timestamp
FROM audit_logs
WHERE "orgId" = 'org-uuid' AND "actorId" = 'user-uuid'
ORDER BY timestamp DESC;
```

### Data Retention

Because `audit_logs` is immutable (`audit_logs_immutable` and `audit_logs_no_truncate`), do not attempt to `DELETE` or `TRUNCATE` rows in `audit_logs`. Archive or export historical records to cold storage according to your retention policy. Campaigns can be exported as JSON or deleted via the `/api/campaigns` API.

### User Offboarding & Soft Deletion (`DELETE /api/users`)

To preserve the immutable audit trail (`audit_logs.actorId` references `users.id` with `ON DELETE RESTRICT`), `DELETE /api/users?id=<userId>` (admin-only) performs an atomic Prisma transaction (`prisma.$transaction`) that:

1. **Enforces safety guards**: Blocks self-deactivation (`400 Bad Request`) and acquires an organization admin lock (`UserRepository.acquireOrgAdminLock`) to prevent deactivating the last active `admin` in the organization (`409 Conflict`).
2. **Soft-deletes the user**: Sets `users.disabledAt` via `UserRepository.deleteInOrg(targetId, orgId, tx)`.
3. **Revokes pending invitations**: Revokes any unused invitations created by the user via `UserRepository.revokePendingInvitationsByCreator(targetId, orgId, tx)`.
4. **Cancels active generation jobs & releases credits**: Calls `cancelActiveJobsForUserInTx` to cancel active `generation_jobs` and release reserved credits back to the balance/ledger.
5. **Logs the action**: Appends a `user_deactivated` record (with `mode: 'soft_delete'`, `revokedPendingInvitations`, `cancelledActiveJobs`, and `releasedCredits`) via `AuditLogRepository.create`.

## Migration from localStorage

If you have existing campaigns stored in browser `localStorage` from offline/demo mode, export them as JSON from the UI and import them after signing in with PostgreSQL persistence enabled via `/api/campaigns`.

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
EXPLAIN ANALYZE SELECT * FROM campaigns WHERE "createdBy" = 'xxx';
```

## Next Steps

1. Set up PostgreSQL database with `pgvector`
2. Configure `DATABASE_URL` and environment variables
3. Apply Prisma migrations (`npx prisma migrate deploy`) and generate client (`npm run db:generate`)
4. Set up automated backups
5. Configure monitoring
6. Test thoroughly

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Database Security Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html)
