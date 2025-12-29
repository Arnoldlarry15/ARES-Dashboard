# Database Migration Strategy

## Overview

This guide covers database schema migrations, data backfilling, and version upgrades for ARES Dashboard.

## Migration Principles

1. **Zero-downtime migrations**: All migrations must be backward compatible
2. **Reversible**: Every migration must have a rollback path
3. **Tested**: All migrations tested in staging before production
4. **Documented**: Clear documentation for each migration
5. **Monitored**: Migration progress and health monitored

## Migration Tools

### Prisma Migrate

ARES uses Prisma Migrate for schema management.

**Development workflow:**

```bash
# Create new migration
npx prisma migrate dev --name add_user_preferences

# Apply migrations
npx prisma migrate deploy

# Reset database (destructive)
npx prisma migrate reset
```

**Production workflow:**

```bash
# Generate migration (don't apply yet)
npx prisma migrate dev --create-only --name add_user_preferences

# Review generated SQL
cat prisma/migrations/*/migration.sql

# Apply in production
npx prisma migrate deploy
```

### Custom Migrations

For complex data transformations, use custom migration scripts:

```typescript
// prisma/migrations/custom/backfill-campaign-metadata.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function up() {
  console.log('Starting campaign metadata backfill...');
  
  const campaigns = await prisma.campaign.findMany({
    where: {
      metadata: null
    }
  });
  
  console.log(`Found ${campaigns.length} campaigns to backfill`);
  
  for (const campaign of campaigns) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        metadata: {
          framework: 'OWASP_LLM_TOP_10',
          version: '1.0',
          createdBy: campaign.createdBy
        }
      }
    });
  }
  
  console.log('Backfill complete');
}

export async function down() {
  console.log('Rolling back campaign metadata backfill...');
  
  await prisma.campaign.updateMany({
    data: {
      metadata: null
    }
  });
  
  console.log('Rollback complete');
}

// Run with: npx ts-node prisma/migrations/custom/backfill-campaign-metadata.ts
```

## Migration Patterns

### 1. Adding a Column (Safe)

**Schema change:**

```prisma
model Campaign {
  id          String   @id @default(cuid())
  name        String
  description String?  // New nullable column
}
```

**Migration steps:**

1. Add column as nullable
2. Deploy application code
3. Backfill data (if needed)
4. Make column required (optional)

**SQL:**

```sql
-- Step 1: Add column
ALTER TABLE "Campaign" ADD COLUMN "description" TEXT;

-- Step 2: Backfill (optional)
UPDATE "Campaign" SET "description" = 'Legacy campaign' WHERE "description" IS NULL;

-- Step 3: Make required (optional)
ALTER TABLE "Campaign" ALTER COLUMN "description" SET NOT NULL;
```

### 2. Renaming a Column (Requires Coordination)

**Safe approach using dual-write:**

```prisma
// Step 1: Add new column
model Campaign {
  id          String   @id
  oldName     String   // Keep old column
  newName     String?  // Add new column
}
```

**Migration process:**

1. Add new column
2. Deploy code that writes to both columns
3. Backfill data from old to new column
4. Deploy code that reads from new column
5. Remove old column

**Implementation:**

```typescript
// Step 2: Dual-write code
async function updateCampaign(id: string, name: string) {
  await prisma.campaign.update({
    where: { id },
    data: {
      oldName: name,  // Keep writing to old
      newName: name   // Also write to new
    }
  });
}

// Step 3: Backfill script
async function backfillNewName() {
  await prisma.$executeRaw`
    UPDATE "Campaign" 
    SET "newName" = "oldName" 
    WHERE "newName" IS NULL
  `;
}

// Step 4: Switch to reading from new column
async function getCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      newName: true  // Read from new column
    }
  });
  return campaign;
}
```

### 3. Changing Column Type

**Safe approach:**

```sql
-- Step 1: Add new column with new type
ALTER TABLE "Campaign" ADD COLUMN "priority_new" INTEGER;

-- Step 2: Backfill data with conversion
UPDATE "Campaign" SET "priority_new" = CAST("priority" AS INTEGER);

-- Step 3: Drop old column and rename (after verification)
ALTER TABLE "Campaign" DROP COLUMN "priority";
ALTER TABLE "Campaign" RENAME COLUMN "priority_new" TO "priority";
```

### 4. Adding an Index (Safe)

```sql
-- Create index concurrently (doesn't lock table)
CREATE INDEX CONCURRENTLY "idx_campaign_created_at" ON "Campaign"("createdAt");

-- Drop index
DROP INDEX CONCURRENTLY "idx_campaign_created_at";
```

### 5. Splitting a Table

**Example: Split User table into User and UserProfile**

```typescript
// Step 1: Create new table
// prisma/migrations/.../migration.sql
CREATE TABLE "UserProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "bio" TEXT,
  "avatar" TEXT,
  FOREIGN KEY ("userId") REFERENCES "User"("id")
);

// Step 2: Backfill data
async function splitUserTable() {
  const users = await prisma.user.findMany();
  
  for (const user of users) {
    await prisma.userProfile.create({
      data: {
        id: cuid(),
        userId: user.id,
        bio: user.bio,
        avatar: user.avatar
      }
    });
  }
}

// Step 3: Update application code to use new table

// Step 4: Remove old columns from User table
ALTER TABLE "User" DROP COLUMN "bio";
ALTER TABLE "User" DROP COLUMN "avatar";
```

## Version Upgrade Strategies

### Major Version Upgrade (0.x → 1.0)

**Preparation checklist:**

- [ ] Review all schema changes
- [ ] Test migration in staging
- [ ] Prepare rollback plan
- [ ] Document breaking changes
- [ ] Create data backup
- [ ] Schedule maintenance window

**Upgrade process:**

```bash
# 1. Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run migrations
npx prisma migrate deploy

# 3. Run data backfill scripts
npx ts-node prisma/migrations/custom/upgrade-v1.ts

# 4. Verify data integrity
npx ts-node scripts/verify-migration.ts

# 5. Update application version
npm version 1.0.0
```

### Minor Version Upgrade (1.0 → 1.1)

**Backward-compatible changes only:**

- Add new tables
- Add nullable columns
- Add indexes
- Add new features (no breaking changes)

```bash
# Standard deployment
npx prisma migrate deploy
```

### Patch Version Upgrade (1.0.0 → 1.0.1)

**No schema changes:**

- Bug fixes
- Performance improvements
- Security patches

```bash
# No migrations needed
npm install && npm run build
```

## Backup and Restore

### PostgreSQL Backup

**Full backup:**

```bash
# Create backup
pg_dump -Fc $DATABASE_URL > ares_backup_$(date +%Y%m%d).dump

# Compressed backup
pg_dump $DATABASE_URL | gzip > ares_backup_$(date +%Y%m%d).sql.gz

# Restore from backup
pg_restore -d $DATABASE_URL ares_backup_20250101.dump
```

**Incremental backup with WAL:**

```bash
# Enable WAL archiving in postgresql.conf
# wal_level = replica
# archive_mode = on
# archive_command = 'cp %p /backup/wal/%f'

# Create base backup
pg_basebackup -D /backup/base -Ft -z -P

# Restore with point-in-time recovery
# See PostgreSQL PITR documentation
```

### Automated Backups

**Kubernetes CronJob:**

```yaml
# backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ares-db-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ares-secrets
                  key: DATABASE_URL
            command:
            - /bin/sh
            - -c
            - |
              pg_dump $DATABASE_URL | gzip > /backup/ares_$(date +%Y%m%d_%H%M%S).sql.gz
              # Upload to S3
              aws s3 cp /backup/*.sql.gz s3://ares-backups/
            volumeMounts:
            - name: backup-volume
              mountPath: /backup
          volumes:
          - name: backup-volume
            emptyDir: {}
          restartPolicy: OnFailure
```

**AWS RDS Automated Backups:**

```bash
# Enable automated backups
aws rds modify-db-instance \
  --db-instance-identifier ares-production \
  --backup-retention-period 30 \
  --preferred-backup-window "02:00-03:00"

# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier ares-production \
  --db-snapshot-identifier ares-pre-migration-$(date +%Y%m%d)
```

## Data Retention and Archival

### Retention Policies

| Data Type | Retention Period | Archive Location |
|-----------|-----------------|------------------|
| Campaigns | 2 years active | S3 Glacier after 2 years |
| Audit Logs | 7 years | S3 Glacier after 1 year |
| User Data | Until account deletion | N/A |
| Session Data | 30 days | No archive |

### Archive Process

**Move old audit logs to archive:**

```typescript
// scripts/archive-audit-logs.ts
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();
const s3 = new S3Client({ region: 'us-east-1' });

async function archiveOldLogs() {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  // Fetch old logs in batches
  let cursor: string | undefined;
  let archived = 0;
  
  while (true) {
    const logs = await prisma.auditLog.findMany({
      take: 1000,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where: {
        timestamp: {
          lt: oneYearAgo
        }
      }
    });
    
    if (logs.length === 0) break;
    
    // Upload to S3
    const key = `audit-logs/${oneYearAgo.getFullYear()}/${Date.now()}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: 'ares-archives',
      Key: key,
      Body: JSON.stringify(logs, null, 2),
      StorageClass: 'GLACIER'
    }));
    
    // Delete from database
    await prisma.auditLog.deleteMany({
      where: {
        id: {
          in: logs.map(log => log.id)
        }
      }
    });
    
    archived += logs.length;
    cursor = logs[logs.length - 1].id;
    
    console.log(`Archived ${archived} logs`);
  }
  
  console.log(`Archive complete. Total: ${archived} logs`);
}
```

**Schedule archival:**

```yaml
# archive-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ares-archive-logs
spec:
  schedule: "0 3 1 * *"  # Monthly on 1st at 3 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: archive
            image: node:20
            command: ["node", "/scripts/archive-audit-logs.js"]
          restartPolicy: OnFailure
```

## Migration Monitoring

### Pre-migration Checks

```typescript
// scripts/pre-migration-check.ts
async function preMigrationCheck() {
  const checks = [];
  
  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: 'Database connectivity', status: 'PASS' });
  } catch (error) {
    checks.push({ name: 'Database connectivity', status: 'FAIL', error });
  }
  
  // Check disk space
  const diskUsage = await getDiskUsage();
  if (diskUsage > 80) {
    checks.push({ name: 'Disk space', status: 'WARN', usage: diskUsage });
  } else {
    checks.push({ name: 'Disk space', status: 'PASS', usage: diskUsage });
  }
  
  // Check backup exists
  const backupExists = await checkBackupExists();
  checks.push({ 
    name: 'Recent backup', 
    status: backupExists ? 'PASS' : 'FAIL' 
  });
  
  // Check table locks
  const locks = await prisma.$queryRaw`
    SELECT COUNT(*) as count 
    FROM pg_locks 
    WHERE locktype = 'relation'
  `;
  checks.push({ name: 'Table locks', status: 'INFO', count: locks[0].count });
  
  return checks;
}
```

### Post-migration Verification

```typescript
// scripts/verify-migration.ts
async function verifyMigration() {
  const tests = [];
  
  // Verify row counts match
  const expectedCounts = {
    Campaign: 1000,
    User: 50,
    AuditLog: 5000
  };
  
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const actual = await prisma[table.toLowerCase()].count();
    tests.push({
      name: `${table} row count`,
      expected,
      actual,
      status: actual >= expected ? 'PASS' : 'FAIL'
    });
  }
  
  // Verify foreign key constraints
  const fkViolations = await prisma.$queryRaw`
    SELECT COUNT(*) as count
    FROM information_schema.constraint_column_usage
    WHERE constraint_name LIKE '%_fkey'
  `;
  tests.push({
    name: 'Foreign key constraints',
    status: fkViolations[0].count === 0 ? 'PASS' : 'FAIL'
  });
  
  // Verify indexes exist
  const expectedIndexes = [
    'idx_campaign_created_at',
    'idx_user_email',
    'idx_audit_log_timestamp'
  ];
  
  for (const index of expectedIndexes) {
    const exists = await checkIndexExists(index);
    tests.push({
      name: `Index ${index}`,
      status: exists ? 'PASS' : 'FAIL'
    });
  }
  
  return tests;
}
```

## Rollback Procedures

### Automatic Rollback

```typescript
// scripts/migrate-with-rollback.ts
async function migrateWithRollback() {
  // Create savepoint
  await prisma.$executeRaw`SAVEPOINT pre_migration`;
  
  try {
    // Run migration
    await runMigration();
    
    // Verify migration
    const verification = await verifyMigration();
    const failed = verification.filter(t => t.status === 'FAIL');
    
    if (failed.length > 0) {
      throw new Error(`Verification failed: ${failed.length} tests`);
    }
    
    // Commit
    console.log('Migration successful');
    
  } catch (error) {
    // Rollback
    console.error('Migration failed, rolling back:', error);
    await prisma.$executeRaw`ROLLBACK TO SAVEPOINT pre_migration`;
    throw error;
  }
}
```

### Manual Rollback

```bash
# Restore from backup
pg_restore -d $DATABASE_URL --clean ares_backup_pre_migration.dump

# Or restore from SQL
psql $DATABASE_URL < ares_backup_pre_migration.sql

# Verify rollback
npm run verify-db-state
```

## Best Practices

1. **Always backup before migration**
   ```bash
   pg_dump $DATABASE_URL > pre_migration_backup.sql
   ```

2. **Test in staging first**
   ```bash
   # Deploy to staging
   DATABASE_URL=$STAGING_DATABASE_URL npx prisma migrate deploy
   
   # Verify
   npm run test:integration
   ```

3. **Use transactions for data migrations**
   ```typescript
   await prisma.$transaction(async (tx) => {
     // All operations in transaction
     await tx.campaign.updateMany(...);
     await tx.auditLog.create(...);
   });
   ```

4. **Monitor migration progress**
   ```typescript
   let processed = 0;
   const total = await prisma.campaign.count();
   
   // Process in batches with progress reporting
   for (let i = 0; i < total; i += 100) {
     await processBatch(i, 100);
     processed += 100;
     console.log(`Progress: ${processed}/${total} (${(processed/total*100).toFixed(1)}%)`);
   }
   ```

5. **Set statement timeout**
   ```sql
   SET statement_timeout = '30min';
   ```

## References

- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [PostgreSQL Migration Best Practices](https://www.postgresql.org/docs/current/ddl-alter.html)
- [Zero-Downtime Migrations](https://spring.io/blog/2016/05/31/zero-downtime-deployment-with-a-database)
