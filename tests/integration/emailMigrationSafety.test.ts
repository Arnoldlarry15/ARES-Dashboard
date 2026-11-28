// @vitest-environment node
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { describe, it, expect } from 'vitest';

const rawDbUrl = process.env.DATABASE_URL;
const isLocalDb =
  Boolean(rawDbUrl) &&
  (rawDbUrl!.includes('localhost') || rawDbUrl!.includes('127.0.0.1'));

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma/migrations');

const PRE_MIGRATIONS = [
  '20261127010900_init_ares_master/migration.sql',
  '20261127020000_add_pgvector_hnsw/migration.sql',
  '20261127090000_audit_log_org_and_immutability/migration.sql',
  '20261127100000_onboarding_legacy_org_and_audit_truncate/migration.sql',
];

const TARGET_MIGRATION =
  '20261127110000_backfill_legacy_orgs_and_lowercase_emails/migration.sql';

async function withDisposableDb(fn: (client: pg.Client) => Promise<void>): Promise<void> {
  const dbName = `ares_mig_safety_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const adminClient = new pg.Client({ connectionString: rawDbUrl });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE "${dbName}"`);

  const targetUrl = new URL(rawDbUrl!);
  targetUrl.pathname = `/${dbName}`;
  const testClient = new pg.Client({ connectionString: targetUrl.toString() });

  try {
    await testClient.connect();
    for (const relPath of PRE_MIGRATIONS) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, relPath), 'utf8');
      await testClient.query(sql);
    }
    await fn(testClient);
  } finally {
    await testClient.end().catch(() => {});
    await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await adminClient.end().catch(() => {});
  }
}

async function runTargetMigrationInTx(client: pg.Client): Promise<void> {
  const migrationSql = fs.readFileSync(path.join(MIGRATIONS_DIR, TARGET_MIGRATION), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(migrationSql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

describe.skipIf(!isLocalDb)('Email Migration Collision Protection (20261127110000)', () => {
  it('normalizes mixed-case/whitespace email and backfills default_org when collision-free', async () => {
    await withDisposableDb(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "email", "role", "orgId", "updatedAt")
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        ['u_alice', ' Alice@Example.test ', 'USER', 'default_org'],
      );

      await runTargetMigrationInTx(client);

      const userRes = await client.query<{ id: string; email: string; orgId: string }>(
        `SELECT "id", "email", "orgId" FROM "users" WHERE "id" = $1`,
        ['u_alice'],
      );
      expect(userRes.rows).toEqual([
        {
          id: 'u_alice',
          email: 'alice@example.test',
          orgId: 'legacy_org_u_alice',
        },
      ]);

      const orgRes = await client.query<{ id: string }>(
        `SELECT "id" FROM "organizations" WHERE "id" = $1`,
        ['legacy_org_u_alice'],
      );
      expect(orgRes.rows).toEqual([{ id: 'legacy_org_u_alice' }]);
    });
  }, 30000);

  it('aborts and rolls back with zero partial modifications on mixed-case email collision', async () => {
    await withDisposableDb(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "email", "role", "orgId", "updatedAt")
         VALUES
           ($1, $2, 'USER', 'default_org', CURRENT_TIMESTAMP),
           ($3, $4, 'USER', 'org_existing', CURRENT_TIMESTAMP)`,
        ['u_1', 'Alice@x.test', 'u_2', 'alice@x.test'],
      );

      await expect(runTargetMigrationInTx(client)).rejects.toThrow(
        /case\/whitespace collisions detected.*alice@x\.test \(2 rows\)/i,
      );

      const usersRes = await client.query<{ id: string; email: string; orgId: string }>(
        `SELECT "id", "email", "orgId" FROM "users" ORDER BY "id" ASC`,
      );
      expect(usersRes.rows).toEqual([
        { id: 'u_1', email: 'Alice@x.test', orgId: 'default_org' },
        { id: 'u_2', email: 'alice@x.test', orgId: 'org_existing' },
      ]);

      const orgsRes = await client.query(`SELECT "id" FROM "organizations"`);
      expect(orgsRes.rows).toHaveLength(0);
    });
  }, 30000);

  it('aborts and rolls back with zero partial modifications on whitespace email collision', async () => {
    await withDisposableDb(async (client) => {
      await client.query(
        `INSERT INTO "users" ("id", "email", "role", "orgId", "updatedAt")
         VALUES
           ($1, $2, 'USER', 'default_org', CURRENT_TIMESTAMP),
           ($3, $4, 'USER', 'org_existing', CURRENT_TIMESTAMP)`,
        ['u_1', ' bob@x.test ', 'u_2', 'bob@x.test'],
      );

      await expect(runTargetMigrationInTx(client)).rejects.toThrow(
        /case\/whitespace collisions detected.*bob@x\.test \(2 rows\)/i,
      );

      const usersRes = await client.query<{ id: string; email: string; orgId: string }>(
        `SELECT "id", "email", "orgId" FROM "users" ORDER BY "id" ASC`,
      );
      expect(usersRes.rows).toEqual([
        { id: 'u_1', email: ' bob@x.test ', orgId: 'default_org' },
        { id: 'u_2', email: 'bob@x.test', orgId: 'org_existing' },
      ]);

      const orgsRes = await client.query(`SELECT "id" FROM "organizations"`);
      expect(orgsRes.rows).toHaveLength(0);
    });
  }, 30000);
});
