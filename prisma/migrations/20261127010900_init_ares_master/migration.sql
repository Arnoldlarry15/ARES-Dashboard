-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "auth0Sub" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "framework" TEXT NOT NULL,
    "tacticId" TEXT NOT NULL,
    "tacticName" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "selectedVectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedPayloadIndices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_credit_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "availableTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_credit_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "jobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "status" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 25,
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "isReplacement" BOOLEAN NOT NULL DEFAULT false,
    "selectedFramework" TEXT NOT NULL,
    "frameworkVersion" TEXT NOT NULL,
    "selectedTacticId" TEXT NOT NULL,
    "selectedTacticName" TEXT NOT NULL,
    "selectedVectors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedAttacks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "objectives" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'gemini',
    "credentialMode" TEXT NOT NULL DEFAULT 'server_managed',
    "workerLeaseId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastCheckpointAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_attempts" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "rejectionStage" TEXT,
    "rejectionReason" TEXT,
    "selectedFramework" TEXT NOT NULL,
    "selectedVector" TEXT NOT NULL,
    "selectedAttack" TEXT NOT NULL,
    "generatorModel" TEXT NOT NULL,
    "evaluatorModel" TEXT,
    "generatorInputTokens" INTEGER NOT NULL DEFAULT 0,
    "generatorOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "evaluatorInputTokens" INTEGER NOT NULL DEFAULT 0,
    "evaluatorOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "embeddingTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sha256Fingerprint" TEXT NOT NULL,
    "similaritySummary" JSONB,
    "evaluatorDecision" TEXT,
    "evaluatorResult" JSONB,
    "candidatePayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_prompt_registry" (
    "id" TEXT NOT NULL,
    "sha256Fingerprint" TEXT NOT NULL,
    "normalizedTextHash" TEXT NOT NULL,
    "structuralSignature" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "frameworkVersion" TEXT NOT NULL,
    "attackVector" TEXT NOT NULL,
    "attackName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT '1.0',
    "payload" JSONB NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embeddingDimensions" INTEGER NOT NULL,
    "embeddingJson" DOUBLE PRECISION[],
    "originalityMetadata" JSONB,
    "acceptanceStatus" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_prompt_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_prompt_vault" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "registryPromptId" TEXT NOT NULL,
    "isDuplicateReported" BOOLEAN NOT NULL DEFAULT false,
    "replacedByVaultId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_prompt_vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vaultItemId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVESTIGATING',
    "investigationResult" JSONB,
    "replacementJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "duplicate_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth0Sub_key" ON "users"("auth0Sub");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_orgId_idx" ON "users"("orgId");

-- CreateIndex
CREATE INDEX "campaigns_createdBy_idx" ON "campaigns"("createdBy");

-- CreateIndex
CREATE INDEX "campaigns_createdAt_idx" ON "campaigns"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "user_credit_balances_userId_key" ON "user_credit_balances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_idempotencyKey_key" ON "credit_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_transactions_userId_idx" ON "credit_transactions"("userId");

-- CreateIndex
CREATE INDEX "credit_transactions_jobId_idx" ON "credit_transactions"("jobId");

-- CreateIndex
CREATE INDEX "credit_transactions_createdAt_idx" ON "credit_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "generation_jobs_status_leaseExpiresAt_idx" ON "generation_jobs"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "generation_jobs_userId_createdAt_idx" ON "generation_jobs"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "generation_jobs_userId_idempotencyKey_key" ON "generation_jobs"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "candidate_attempts_jobId_status_idx" ON "candidate_attempts"("jobId", "status");

-- CreateIndex
CREATE INDEX "candidate_attempts_userId_createdAt_idx" ON "candidate_attempts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "candidate_attempts_sha256Fingerprint_idx" ON "candidate_attempts"("sha256Fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "global_prompt_registry_sha256Fingerprint_key" ON "global_prompt_registry"("sha256Fingerprint");

-- CreateIndex
CREATE INDEX "global_prompt_registry_normalizedTextHash_idx" ON "global_prompt_registry"("normalizedTextHash");

-- CreateIndex
CREATE INDEX "global_prompt_registry_framework_attackVector_idx" ON "global_prompt_registry"("framework", "attackVector");

-- CreateIndex
CREATE INDEX "global_prompt_registry_embeddingModel_embeddingDimensions_idx" ON "global_prompt_registry"("embeddingModel", "embeddingDimensions");

-- CreateIndex
CREATE INDEX "customer_prompt_vault_userId_acquiredAt_idx" ON "customer_prompt_vault"("userId", "acquiredAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_prompt_vault_userId_registryPromptId_key" ON "customer_prompt_vault"("userId", "registryPromptId");

-- CreateIndex
CREATE INDEX "duplicate_reports_userId_idx" ON "duplicate_reports"("userId");

-- CreateIndex
CREATE INDEX "duplicate_reports_vaultItemId_idx" ON "duplicate_reports"("vaultItemId");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_credit_balances" ADD CONSTRAINT "user_credit_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_attempts" ADD CONSTRAINT "candidate_attempts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_attempts" ADD CONSTRAINT "candidate_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_prompt_vault" ADD CONSTRAINT "customer_prompt_vault_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_prompt_vault" ADD CONSTRAINT "customer_prompt_vault_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_prompt_vault" ADD CONSTRAINT "customer_prompt_vault_registryPromptId_fkey" FOREIGN KEY ("registryPromptId") REFERENCES "global_prompt_registry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_reports" ADD CONSTRAINT "duplicate_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_reports" ADD CONSTRAINT "duplicate_reports_vaultItemId_fkey" FOREIGN KEY ("vaultItemId") REFERENCES "customer_prompt_vault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
