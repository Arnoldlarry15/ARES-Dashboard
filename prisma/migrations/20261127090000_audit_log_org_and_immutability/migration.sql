-- Add orgId column (nullable initially for safe backfill)
ALTER TABLE "audit_logs" ADD COLUMN "orgId" TEXT;

-- Backfill orgId from actor's user record
UPDATE "audit_logs" a
SET "orgId" = u."orgId"
FROM "users" u
WHERE a."actorId" = u."id";

-- Fallback for any orphan rows without a matching user
UPDATE "audit_logs"
SET "orgId" = 'unknown'
WHERE "orgId" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "audit_logs" ALTER COLUMN "orgId" SET NOT NULL;

-- Composite index for org-scoped chronological queries
CREATE INDEX "audit_logs_orgId_timestamp_idx" ON "audit_logs"("orgId", "timestamp");

-- Enforce append-only immutability at the database level
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % operations are prohibited', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_mutation();
