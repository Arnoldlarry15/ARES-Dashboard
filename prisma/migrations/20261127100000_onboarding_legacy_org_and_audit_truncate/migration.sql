-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_invitations" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "invitedEmail" TEXT,
    "role" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_invitations_tokenHash_key" ON "organization_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "organization_invitations_orgId_idx" ON "organization_invitations"("orgId");

-- CreateIndex
CREATE INDEX "organization_invitations_expiresAt_idx" ON "organization_invitations"("expiresAt");

-- AddForeignKey
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reconcile any legacy users with orgId = 'default_org'
UPDATE "users"
SET "orgId" = 'legacy_org_' || "id",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "orgId" = 'default_org';

-- Backfill any audit_logs rows with orgId = 'default_org' from users.orgId
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "audit_logs" WHERE "orgId" = 'default_org') THEN
    ALTER TABLE "audit_logs" DISABLE TRIGGER audit_logs_immutable;

    UPDATE "audit_logs" a
    SET "orgId" = u."orgId"
    FROM "users" u
    WHERE a."actorId" = u."id"
      AND a."orgId" = 'default_org';

    ALTER TABLE "audit_logs" ENABLE TRIGGER audit_logs_immutable;
  END IF;
END $$;

-- Add statement-level BEFORE TRUNCATE protection on audit_logs (preserving audit_logs_immutable)
CREATE OR REPLACE FUNCTION prevent_audit_log_truncate()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: TRUNCATE is not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_truncate
BEFORE TRUNCATE ON "audit_logs"
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_audit_log_truncate();
