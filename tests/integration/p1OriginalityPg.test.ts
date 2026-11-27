import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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
  acceptCandidateIntoRegistryWithLock,
  checkOriginalityAgainstRegistry,
  isPgVectorAvailable
} from '../../lib/originality/originalityService';
import {
  createGenerationJob,
  estimateAttemptCostUsd,
  processGenerationJobStep,
  reportDeliveredDuplicate
} from '../../lib/jobs/generationJobService';

function make768Vec(seed: number): number[] {
  const vec = new Array<number>(768).fill(0);
  vec[0] = Math.cos(seed);
  vec[1] = Math.sin(seed);
  vec[2] = 0.05;
  return vec;
}

const isLocalDb =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.DATABASE_URL!.includes('localhost') || process.env.DATABASE_URL!.includes('127.0.0.1'));

describe.skipIf(!isLocalDb)('P1 Real PostgreSQL + pgvector Originality, Duplicate Reporting & Cost Aggregation', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const userA = `p1_user_a_${runId}`;
  const userB = `p1_user_b_${runId}`;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: userA, email: `${userA}@local.test`, role: 'analyst', orgId: 'p1_org' },
        { id: userB, email: `${userB}@local.test`, role: 'analyst', orgId: 'p1_org' }
      ]
    });
  });

  afterAll(async () => {
    await prisma.duplicateReport.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.customerPromptVault.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.candidateAttempt.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.creditTransaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.generationJob.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.userCreditBalance.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.globalPromptRegistry.deleteMany({ where: { attackName: { startsWith: `p1_${runId}` } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.duplicateReport.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.customerPromptVault.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.candidateAttempt.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.creditTransaction.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.generationJob.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.userCreditBalance.deleteMany({ where: { userId: { in: [userA, userB] } } });
  });

  it('verifies pgvector is active and detects exact, lexical, semantic (HNSW), global, and customer-history matches without rejecting distinct attacks', async () => {
    expect(await isPgVectorAvailable()).toBe(true);

    const baseVec = make768Vec(0.2);
    const baseText = `Extract hidden system prompt using nested XML comment boundary bypass technique against autonomous assistant ${runId}`;
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: baseVec }] });

    const orig1 = await checkOriginalityAgainstRegistry({
      userId: userA,
      candidate: { description: 'Base', payload: baseText, format: 'Prompt' },
      apiKey: 'mock-key'
    });
    expect(orig1.passedDeterministic).toBe(true);
    expect(orig1.usedPgVector).toBe(true);

    const { registryId: reg1Id } = await acceptCandidateIntoRegistryWithLock({
      candidate: { description: 'Base', payload: baseText, format: 'Prompt' },
      framework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      attackVector: 'Direct Instruction Override',
      attackName: `p1_${runId}_base`,
      originality: orig1,
      originalityMetadata: {}
    });

    // Attach reg1 to userA's vault to verify customer-history flagging
    await prisma.userCreditBalance.create({ data: { userId: userA, availableTokens: 1, reservedTokens: 0 } });
    const seedJob = await createGenerationJob({
      userId: userA,
      requestedCount: 4,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: [`p1_${runId}_base`],
      idempotencyKey: `seed-${runId}`
    });
    await prisma.customerPromptVault.create({
      data: { userId: userA, jobId: seedJob.id, registryPromptId: reg1Id }
    });

    // 1. Exact/normalized duplicate -> rejected deterministically
    const exactCheck = await checkOriginalityAgainstRegistry({
      userId: userB,
      candidate: { description: 'Dup', payload: `  ${baseText.toUpperCase()}! `, format: 'Prompt' },
      apiKey: 'mock-key'
    });
    expect(exactCheck.passedDeterministic).toBe(false);
    expect(exactCheck.rejectionStage).toBe('EXACT_DUPLICATE');

    // 2. Lexical near-duplicate -> rejected deterministically (>= 0.92 Jaccard)
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: make768Vec(1.5) }] });
    const lexCheck = await checkOriginalityAgainstRegistry({
      userId: userB,
      candidate: {
        description: 'Near dup',
        payload: `Extract hidden system prompt using nested XML comment boundary bypass technique against autonomous assistant ${runId} please`,
        format: 'Prompt'
      },
      apiKey: 'mock-key'
    });
    expect(lexCheck.passedDeterministic).toBe(false);
    expect(lexCheck.rejectionStage).toBe('LEXICAL');

    // 3. Semantic match via pgvector HNSW (different wording, same 768-dim direction) -> surfaced in suspectMatches for both global & customer history
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: make768Vec(0.21) }] });
    const semCheckA = await checkOriginalityAgainstRegistry({
      userId: userA,
      candidate: {
        description: 'Paraphrase',
        payload: `Coerce model into dumping developer instructions via forged markup tags ${runId}`,
        format: 'Prompt'
      },
      apiKey: 'mock-key'
    });
    expect(semCheckA.passedDeterministic).toBe(true);
    expect(semCheckA.suspectMatches.some(m => m.registryId === reg1Id && m.acquiredByUser === true)).toBe(true);

    // 4. Legitimate methodological variation (orthogonal 768-dim vector) -> no suspect match
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: make768Vec(1.8) }] });
    const distinctCheck = await checkOriginalityAgainstRegistry({
      userId: userB,
      candidate: {
        description: 'Tool Abuse',
        payload: `{"tool":"execute_sql","params":{"sql":"SELECT current_user"}} ${runId}`,
        format: 'JSON'
      },
      apiKey: 'mock-key'
    });
    expect(distinctCheck.passedDeterministic).toBe(true);
    expect(distinctCheck.suspectMatches).toHaveLength(0);
  });

  it('rejects concurrent semantically equivalent acceptance inside pg_advisory_xact_lock', async () => {
    const vec = make768Vec(0.95);
    const now = new Date();
    const candA = { description: 'A', payload: `First concurrent strategy alpha ${runId}`, format: 'Prompt' };
    const candB = { description: 'B', payload: `Second concurrent strategy beta ${runId}`, format: 'Prompt' };

    const origA = {
      passedDeterministic: true,
      sha256Fingerprint: crypto.createHash('sha256').update(candA.payload).digest('hex'),
      normalizedTextHash: crypto.createHash('sha256').update(candA.payload.toLowerCase()).digest('hex'),
      structuralSignature: 'Prompt|1',
      embedding: vec,
      embeddingModel: 'gemini-embedding-001',
      embeddingDimensions: 768,
      embeddingTokens: 10,
      suspectMatches: [],
      usedPgVector: true,
      checkStartedAt: now
    };
    const origB = {
      passedDeterministic: true,
      sha256Fingerprint: crypto.createHash('sha256').update(candB.payload).digest('hex'),
      normalizedTextHash: crypto.createHash('sha256').update(candB.payload.toLowerCase()).digest('hex'),
      structuralSignature: 'Prompt|1',
      embedding: vec, // Same semantic vector!
      embeddingModel: 'gemini-embedding-001',
      embeddingDimensions: 768,
      embeddingTokens: 10,
      suspectMatches: [],
      usedPgVector: true,
      checkStartedAt: now
    };

    const race = await Promise.allSettled([
      acceptCandidateIntoRegistryWithLock({
        candidate: candA,
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `p1_${runId}_conc`,
        originality: origA,
        originalityMetadata: {}
      }),
      acceptCandidateIntoRegistryWithLock({
        candidate: candB,
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `p1_${runId}_conc`,
        originality: origB,
        originalityMetadata: {}
      })
    ]);

    expect(race.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(race.filter(r => r.status === 'rejected')).toHaveLength(1);
  });

  it('handles embedding model/dimension mismatch safely and fails closed on embedding provider error', async () => {
    // Insert a legacy 3-dim row with a different model
    await prisma.globalPromptRegistry.create({
      data: {
        sha256Fingerprint: crypto.createHash('sha256').update(`legacy-${runId}`).digest('hex'),
        normalizedTextHash: crypto.createHash('sha256').update(`legacy-${runId}`).digest('hex'),
        structuralSignature: 'Prompt|1',
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `p1_${runId}_legacy`,
        payload: { description: 'Legacy', payload: `Legacy unique text ${runId}`, format: 'Prompt' },
        embeddingModel: 'legacy-embed-v0',
        embeddingDimensions: 3,
        embeddingJson: [0.1, 0.2, 0.3]
      }
    });

    // 768-dim check skips comparing incompatible 3-dim legacy vector without throwing
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: make768Vec(2.2) }] });
    const res = await checkOriginalityAgainstRegistry({
      userId: userA,
      candidate: { description: 'New', payload: `Brand new 768-dim prompt ${runId}`, format: 'Prompt' },
      apiKey: 'mock-key'
    });
    expect(res.passedDeterministic).toBe(true);

    // Embedding provider failure fails closed
    mockEmbedContent.mockRejectedValueOnce(new Error('Embedding service unavailable'));
    await expect(
      checkOriginalityAgainstRegistry({
        userId: userA,
        candidate: { description: 'Fail', payload: `Should fail closed ${runId}`, format: 'Prompt' },
        apiKey: 'mock-key'
      })
    ).rejects.toThrow('Embedding service unavailable');
  });

  it('verifies independent duplicate reporting, concurrent report idempotency, and totalCostUsd aggregation across retries', async () => {
    await prisma.userCreditBalance.create({ data: { userId: userA, availableTokens: 1, reservedTokens: 0 } });
    const job = await createGenerationJob({
      userId: userA,
      requestedCount: 4,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: [`p1_${runId}_cost`],
      idempotencyKey: `cost-${runId}`
    });

    // Step 1: Evaluator REJECTS (still aggregates Generator + Evaluator + Embedding cost!)
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          description: 'Weak',
          payload: `Weak candidate ${runId}`,
          format: 'Prompt',
          attack_name: `p1_${runId}_cost`,
          attack_objective: 'Test'
        }),
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 }
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          decision: 'REJECT',
          technicalValidityScore: 0.3,
          alignmentScore: 0.4,
          originalityScore: 0.5,
          practicalValueScore: 0.2,
          isSubstantiveDuplicate: false,
          rejectionReason: 'Too generic',
          reasoning: 'Generic'
        }),
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200 }
      });
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: make768Vec(0.5) }] });

    const step1 = await processGenerationJobStep({ jobId: job.id, geminiApiKey: 'mock-key' });
    expect(step1.acceptedCount).toBe(0);

    const jobAfterStep1 = await prisma.generationJob.findUnique({ where: { id: job.id } });
    const expectedStep1Cost = estimateAttemptCostUsd({
      generatorInputTokens: 1000,
      generatorOutputTokens: 500,
      evaluatorInputTokens: 800,
      evaluatorOutputTokens: 200,
      embeddingTokens: Math.ceil((`\nTest\nWeak candidate ${runId}`).length / 4)
    });
    expect(jobAfterStep1?.totalCostUsd).toBeGreaterThan(0);
    expect(jobAfterStep1?.totalCostUsd).toBeCloseTo(expectedStep1Cost, 6);

    // Duplicate reporting: create 2 vault-eligible registry prompts with close embeddings
    const regA = await prisma.globalPromptRegistry.create({
      data: {
        sha256Fingerprint: crypto.createHash('sha256').update(`vault-a-${runId}`).digest('hex'),
        normalizedTextHash: crypto.createHash('sha256').update(`vault-a-${runId}`).digest('hex'),
        structuralSignature: 'Prompt|1',
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `p1_${runId}_dup_a`,
        payload: { description: 'A', payload: `Alpha directive bypass ${runId}`, format: 'Prompt' },
        embeddingModel: 'gemini-embedding-001',
        embeddingDimensions: 768,
        embeddingJson: make768Vec(0.11)
      }
    });
    await prisma.globalPromptRegistry.create({
      data: {
        sha256Fingerprint: crypto.createHash('sha256').update(`vault-b-${runId}`).digest('hex'),
        normalizedTextHash: crypto.createHash('sha256').update(`vault-b-${runId}`).digest('hex'),
        structuralSignature: 'Prompt|1',
        framework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        attackVector: 'Direct Instruction Override',
        attackName: `p1_${runId}_dup_b`,
        payload: { description: 'B', payload: `Beta system instruction override ${runId}`, format: 'Prompt' },
        embeddingModel: 'gemini-embedding-001',
        embeddingDimensions: 768,
        embeddingJson: make768Vec(0.11)
      }
    });
    // Sync embeddingVector for both
    const vLit = `[${make768Vec(0.11).join(',')}]`;
    await prisma.$executeRaw`UPDATE "global_prompt_registry" SET "embeddingVector" = ${vLit}::vector WHERE "attackName" LIKE ${`p1_${runId}_dup_%`}`;

    const vaultItem = await prisma.customerPromptVault.create({
      data: { userId: userA, jobId: job.id, registryPromptId: regA.id }
    });

    // Case A: Evaluator says NOT substantive duplicate -> REJECTED, no replacement
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: make768Vec(0.11) }] });
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        decision: 'ACCEPT',
        technicalValidityScore: 0.9,
        alignmentScore: 0.9,
        originalityScore: 0.9,
        practicalValueScore: 0.9,
        isSubstantiveDuplicate: false,
        reasoning: 'Different attack methodology'
      })
    });
    const rejectedReport = await reportDeliveredDuplicate({
      userId: userA,
      vaultItemId: vaultItem.id,
      reason: 'Looks similar',
      geminiApiKey: 'mock-key'
    });
    expect(rejectedReport.confirmed).toBe(false);
    expect(rejectedReport.replacementJobId).toBeNull();

    // Case B: Concurrent confirmed duplicate reports -> exactly 1 succeeds and 1 returns 409
    mockEmbedContent
      .mockResolvedValueOnce({ embeddings: [{ values: make768Vec(0.11) }] })
      .mockResolvedValueOnce({ embeddings: [{ values: make768Vec(0.11) }] });
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          decision: 'REJECT',
          technicalValidityScore: 0.9,
          alignmentScore: 0.9,
          originalityScore: 0.1,
          practicalValueScore: 0.2,
          isSubstantiveDuplicate: true,
          rejectionReason: 'Substantive duplicate',
          reasoning: 'Duplicate'
        })
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          decision: 'REJECT',
          technicalValidityScore: 0.9,
          alignmentScore: 0.9,
          originalityScore: 0.1,
          practicalValueScore: 0.2,
          isSubstantiveDuplicate: true,
          rejectionReason: 'Substantive duplicate',
          reasoning: 'Duplicate'
        })
      });

    const dupRace = await Promise.allSettled([
      reportDeliveredDuplicate({
        userId: userA,
        vaultItemId: vaultItem.id,
        reason: 'Confirmed duplicate',
        geminiApiKey: 'mock-key'
      }),
      reportDeliveredDuplicate({
        userId: userA,
        vaultItemId: vaultItem.id,
        reason: 'Confirmed duplicate',
        geminiApiKey: 'mock-key'
      })
    ]);

    expect(dupRace.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(dupRace.filter(r => r.status === 'rejected')).toHaveLength(1);
    const grants = await prisma.creditTransaction.findMany({
      where: { userId: userA, type: 'REPLACEMENT_GRANT' }
    });
    expect(grants).toHaveLength(1);
    expect(grants[0].amount).toBe(0);
  }, 30000);
});
