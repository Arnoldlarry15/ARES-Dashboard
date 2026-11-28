-- 0. Pre-flight check: abort cleanly before any mutation if users.email has case/whitespace collisions
DO $$
DECLARE
  collision_list TEXT;
BEGIN
  SELECT string_agg(norm_email || ' (' || cnt || ' rows)', ', ')
  INTO collision_list
  FROM (
    SELECT LOWER(TRIM("email")) AS norm_email, COUNT(*) AS cnt
    FROM "users"
    GROUP BY LOWER(TRIM("email"))
    HAVING COUNT(*) > 1
  ) dupes;

  IF collision_list IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot normalize users.email: case/whitespace collisions detected for [%]. Resolve duplicate user records manually before applying this migration.', collision_list;
  END IF;
END $$;

-- 1. Migrate any remaining legacy users with orgId = 'default_org'
UPDATE "users"
SET "orgId" = 'legacy_org_' || "id",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "orgId" = 'default_org';

-- 2. Conditionally backfill any audit_logs rows with orgId = 'default_org' from users.orgId
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

-- 3. Idempotently provision organizations rows for all legacy_org_% users
INSERT INTO "organizations" ("id", "name", "createdBy", "createdAt", "updatedAt")
SELECT DISTINCT ON (u."orgId")
  u."orgId",
  'Legacy Organization (' || u."id" || ')',
  COALESCE(u."auth0Sub", u."id"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
WHERE u."orgId" LIKE 'legacy_org_%'
ON CONFLICT ("id") DO NOTHING;

-- 4. Normalize mixed-case or padded emails in users and organization_invitations
UPDATE "users"
SET "email" = LOWER(TRIM("email")),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "email" <> LOWER(TRIM("email"));

UPDATE "organization_invitations"
SET "invitedEmail" = LOWER(TRIM("invitedEmail"))
WHERE "invitedEmail" IS NOT NULL
  AND "invitedEmail" <> LOWER(TRIM("invitedEmail"));
