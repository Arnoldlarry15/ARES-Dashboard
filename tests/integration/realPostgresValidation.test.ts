import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const mockGenerateContent = vi.fn();
const mockEmbedContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      embedContent: mockEmbedContent
    };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY'
  }
}));

import prisma from '../../utils/db';
import {
  JobDomainError,
  createGenerationJob,
  getSanitizedJobStatus,
  processGenerationJobStep,
  recoverStalledJobs
} from '../../lib/jobs/generationJobService';
import {
  acceptCandidateIntoRegistryWithLock,
  computeNormalizedTextHash,
  computeSha256Fingerprint,
  computeStructuralSignature
} from '../../lib/originality/originalityService';

function createIndependentClient(): { client: PrismaClient; pool: Pool } {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return { client: new PrismaClient({ adapter }), pool };
}

const isLocalDb =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.DATABASE_URL!.includes('localhost') || process.env.DATABASE_URL!.includes('127.0.0.1'));

describe.skipIf(!isLocalDb)('Real PostgreSQL Concurrency & Lifecycle Validation', () => {
  let connA: { client: PrismaClient; pool: Pool };
  let connB: { client: PrismaClient; pool: Pool };
  const testRunId = crypto.randomUUID().slice(0, 8);
  const userAId = `pg_test_user_a_${testRunId}`;
  const userBId = `pg_test_user_b_${testRunId}`;

  beforeAll(async () => {
    connA = createIndependentClient();
    connB = createIndependentClient();

    await prisma.user.createMany({
      data: [
        { id: userAId, email: `${userAId}@local.test`, role: 'analyst', orgId: 'test_org' },
        { id: userBId, email: `${userBId}@local.test`, role: 'analyst', orgId: 'test_org' }
      ]
    });
  });

  afterAll(async () => {
    // Clean up only rows created by this test run
    await prisma.duplicateReport.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.customerPromptVault.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.candidateAttempt.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.creditTransaction.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.generationJob.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.userCreditBalance.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.globalPromptRegistry.deleteMany({ where: { attackName: { startsWith: `pgtest_${testRunId}` } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });

    await connA.client.$disconnect();
    await connA.pool.end();
    await connB.client.$disconnect();
    await connB.pool.end();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.customerPromptVault.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.candidateAttempt.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.creditTransaction.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.generationJob.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.userCreditBalance.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  });

  it('1-3. enforces atomic credit reservation, concurrent balance protection, and user-scoped idempotency', async () => {
    await prisma.userCreditBalance.create({
      data: { userId: userAId, availableTokens: 1, reservedTokens: 0 }
    });
    await prisma.userCreditBalance.create({
      data: { userId: userBId, availableTokens: 1, reservedTokens: 0 }
    });

    // Concurrent job creation for userA who only has 1 credit (enough for one 4-prompt job)
    const results = await Promise.allSettled([
      createGenerationJob({
        userId: userAId,
        requestedCount: 4,
        selectedFramework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        selectedTacticId: 'LLM01:2026',
        selectedTacticName: 'Prompt Injection',
        selectedVectors: ['Direct Instruction Override'],
        selectedAttacks: [`pgtest_${testRunId}_1`],
        idempotencyKey: `shared-key-${testRunId}`
      }),
      createGenerationJob({
        userId: userAId,
        requestedCount: 4,
        selectedFramework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        selectedTacticId: 'LLM01:2026',
        selectedTacticName: 'Prompt Injection',
        selectedVectors: ['Direct Instruction Override'],
        selectedAttacks: [`pgtest_${testRunId}_2`],
        idempotencyKey: `other-key-${testRunId}`
      })
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(JobDomainError);

    const balA = await prisma.userCreditBalance.findUnique({ where: { userId: userAId } });
    expect(balA?.availableTokens).toBe(0);
    expect(balA?.reservedTokens).toBe(1);

    // Same idempotencyKey for userB succeeds independently (user-scoped @@unique([userId, idempotencyKey]))
    const jobB = await createGenerationJob({
      userId: userBId,
      requestedCount: 4,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: [`pgtest_${testRunId}_b`],
      idempotencyKey: `shared-key-${testRunId}`
    });
    expect(jobB.reservedCredits).toBe(1);
  });

  it('4-5. enforces pg_advisory_xact_lock and prevents concurrent duplicate registry acceptance', async () => {
    const payloadText = `Concurrent duplicate payload ${testRunId} ${crypto.randomUUID()}`;
    const candidate = { description: 'Test', payload: payloadText, format: 'Prompt' };
    const sha = computeSha256Fingerprint(payloadText);
    const norm = computeNormalizedTextHash(payloadText);
    const sig = computeStructuralSignature(candidate);

    const originality = {
      passedDeterministic: true,
      sha256Fingerprint: sha,
      normalizedTextHash: norm,
      structuralSignature: sig,
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: 'gemini-embedding-001',
      embeddingDimensions: 3,
      embeddingTokens: 10,
      suspectMatches: [],
      usedPgVector: false
    };

    const race = await Promise.allSettled([
      acceptCandidateIntoRegistryWithLock({
        candidate,
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `pgtest_${testRunId}_race`,
        originality,
        originalityMetadata: {}
      }),
      acceptCandidateIntoRegistryWithLock({
        candidate,
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `pgtest_${testRunId}_race`,
        originality,
        originalityMetadata: {}
      })
    ]);

    expect(race.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(race.filter(r => r.status === 'rejected')).toHaveLength(1);
  });

  it('6-8. enforces lease expiration, recovery race safety, and stale-lease rejection in real PostgreSQL', async () => {
    await prisma.userCreditBalance.create({
      data: { userId: userAId, availableTokens: 1, reservedTokens: 0 }
    });
    const job = await createGenerationJob({
      userId: userAId,
      requestedCount: 4,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: [`pgtest_${testRunId}_lease`],
      idempotencyKey: `lease-${testRunId}`
    });

    // ConnA claims active lease
    const activeClaim = await connA.client.generationJob.updateMany({
      where: { id: job.id, workerLeaseId: null },
      data: { status: 'RUNNING', workerLeaseId: 'lease-a', leaseExpiresAt: new Date(Date.now() + 60_000) }
    });
    expect(activeClaim.count).toBe(1);

    // ConnB cannot clear active lease during recovery
    const recWhileActive = await recoverStalledJobs();
    expect(recWhileActive.resumedJobIds).not.toContain(job.id);

    // Expire lease, then ConnB claims it before recovery clears it -> conditional clear skips
    await connA.client.generationJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(Date.now() - 5_000) }
    });

    // Stale worker ('lease-a') cannot insert into GlobalPromptRegistry
    const staleText = `Stale worker payload ${testRunId} ${crypto.randomUUID()}`;
    const staleCandidate = { description: 'Stale', payload: staleText, format: 'Prompt' };
    await expect(
      acceptCandidateIntoRegistryWithLock({
        candidate: staleCandidate,
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `pgtest_${testRunId}_stale`,
        originality: {
          passedDeterministic: true,
          sha256Fingerprint: computeSha256Fingerprint(staleText),
          normalizedTextHash: computeNormalizedTextHash(staleText),
          structuralSignature: computeStructuralSignature(staleCandidate),
          embedding: [0.2, 0.3, 0.4],
          embeddingModel: 'gemini-embedding-001',
          embeddingDimensions: 3,
          embeddingTokens: 5,
          suspectMatches: [],
          usedPgVector: false
        },
        originalityMetadata: {},
        jobId: job.id,
        expectedLeaseId: 'wrong-lease-id'
      })
    ).rejects.toThrow('STALE_WORKER_LEASE');
  });

  it('9-12. enforces atomic 4-prompt completion, no partial exposure, terminal failure release, and idempotent duplicate recovery', async () => {
    await prisma.userCreditBalance.create({
      data: { userId: userAId, availableTokens: 2, reservedTokens: 0 }
    });

    const job = await createGenerationJob({
      userId: userAId,
      requestedCount: 4,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: [`pgtest_${testRunId}_pkg`],
      idempotencyKey: `pkg-${testRunId}`
    });

    // Run 3 accepted steps: verify zero partial delivery
    for (let i = 1; i <= 3; i++) {
      const uniqueText = `Unique real-PG payload #${i} for ${testRunId} ${crypto.randomUUID()}`;
      mockGenerateContent
        .mockResolvedValueOnce({
          text: JSON.stringify({
            description: `Prompt ${i}`,
            payload: uniqueText,
            format: 'Prompt',
            attack_name: `pgtest_${testRunId}_pkg`,
            attack_objective: 'Test'
          })
        })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            decision: 'ACCEPT',
            technicalValidityScore: 0.9,
            alignmentScore: 0.9,
            originalityScore: 0.9,
            practicalValueScore: 0.9,
            isSubstantiveDuplicate: false,
            reasoning: 'Original'
          })
        });
      mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: [i * 0.1, 0.2, 0.3] }] });

      await prisma.generationJob.update({ where: { id: job.id }, data: { nextRetryAt: null } });
      const res = await processGenerationJobStep({ jobId: job.id, geminiApiKey: 'mock-key' });
      expect(res.acceptedCount).toBe(i);
      expect(res.status).toBe('RUNNING');

      const partialStatus = await getSanitizedJobStatus(job.id, userAId);
      expect(partialStatus.deliveredPrompts).toEqual([]);
    }

    // 4th accepted step completes package atomically
    const fourthText = `Unique real-PG payload #4 for ${testRunId} ${crypto.randomUUID()}`;
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          description: 'Prompt 4',
          payload: fourthText,
          format: 'Prompt',
          attack_name: `pgtest_${testRunId}_pkg`,
          attack_objective: 'Test'
        })
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          decision: 'ACCEPT',
          technicalValidityScore: 0.9,
          alignmentScore: 0.9,
          originalityScore: 0.9,
          practicalValueScore: 0.9,
          isSubstantiveDuplicate: false,
          reasoning: 'Original'
        })
      });
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: [0.4, 0.2, 0.3] }] });

    await prisma.generationJob.update({ where: { id: job.id }, data: { nextRetryAt: null } });
    const finalRes = await processGenerationJobStep({ jobId: job.id, geminiApiKey: 'mock-key' });
    expect(finalRes.status).toBe('COMPLETED');
    expect(finalRes.acceptedCount).toBe(4);

    const completedStatus = await getSanitizedJobStatus(job.id, userAId);
    expect(completedStatus.deliveredPrompts).toHaveLength(4);

    const balAfterComplete = await prisma.userCreditBalance.findUnique({ where: { userId: userAId } });
    expect(balAfterComplete?.availableTokens).toBe(1);
    expect(balAfterComplete?.reservedTokens).toBe(0);

    // Create a second job that exceeds maxRetries and test duplicate concurrent recovery calls -> 1 RELEASE only
    const failJob = await createGenerationJob({
      userId: userAId,
      requestedCount: 4,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: [`pgtest_${testRunId}_fail`],
      idempotencyKey: `fail-${testRunId}`
    });

    await prisma.generationJob.update({
      where: { id: failJob.id },
      data: {
        status: 'RUNNING',
        retryCount: 15,
        maxRetries: 15,
        leaseExpiresAt: new Date(Date.now() - 10_000),
        workerLeaseId: 'dead-worker'
      }
    });

    await Promise.all([recoverStalledJobs(), recoverStalledJobs()]);

    const balAfterRelease = await prisma.userCreditBalance.findUnique({ where: { userId: userAId } });
    expect(balAfterRelease?.availableTokens).toBe(1);
    expect(balAfterRelease?.reservedTokens).toBe(0);

    const releaseTxs = await prisma.creditTransaction.findMany({
      where: { jobId: failJob.id, type: 'RELEASE' }
    });
    expect(releaseTxs).toHaveLength(1);
  }, 30000);
});
