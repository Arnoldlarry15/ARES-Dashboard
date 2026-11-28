import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockUpdateMany,
  mockFindUnique,
  mockCandidateAttemptCreate,
  mockUserCreditBalanceUpdateMany,
  mockCreditTransactionCreate,
  mockGenerateContent,
  mockCheckOriginality,
  mockEvaluateCandidate,
  mockAcceptCandidate,
} = vi.hoisted(() => {
  process.env.ARES_CANDIDATES_PER_STEP = '2';
  return {
    mockUpdateMany: vi.fn(),
    mockFindUnique: vi.fn(),
    mockCandidateAttemptCreate: vi.fn(),
    mockUserCreditBalanceUpdateMany: vi.fn(),
    mockCreditTransactionCreate: vi.fn(),
    mockGenerateContent: vi.fn(),
    mockCheckOriginality: vi.fn(),
    mockEvaluateCandidate: vi.fn(),
    mockAcceptCandidate: vi.fn(),
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
  },
}));

vi.mock('../../utils/db', () => {
  const tx = {
    generationJob: {
      updateMany: mockUpdateMany,
      findUnique: mockFindUnique,
    },
    candidateAttempt: {
      create: mockCandidateAttemptCreate,
    },
    userCreditBalance: {
      updateMany: mockUserCreditBalanceUpdateMany,
    },
    creditTransaction: {
      create: mockCreditTransactionCreate,
    },
  };
  return {
    default: {
      ...tx,
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock('../../lib/originality/originalityService', () => ({
  checkOriginalityAgainstRegistry: mockCheckOriginality,
  acceptCandidateIntoRegistryWithLock: mockAcceptCandidate,
}));

vi.mock('../../lib/ai/candidateEvaluator', () => ({
  evaluateCandidateIndependently: mockEvaluateCandidate,
}));

vi.mock('../../lib/ai/tacticGeneration', () => ({
  buildSingleCandidatePrompt: vi.fn(() => 'mock prompt'),
}));

import { processGenerationJobStep } from '../../lib/jobs/generationJobService';

describe('processGenerationJobStep error-path totalCostUsd persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCandidateAttemptCreate.mockResolvedValue({ id: 'attempt-1' });
    mockUserCreditBalanceUpdateMany.mockResolvedValue({ count: 1 });
    mockCreditTransactionCreate.mockResolvedValue({ id: 'tx-1' });
    mockAcceptCandidate.mockResolvedValue(undefined);
  });

  function setupTwoIterationFailure(retryCount: number, maxRetries: number) {
    const baseJob = {
      id: 'job-1',
      userId: 'user-1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount,
      maxRetries,
      reservedCredits: 1,
      selectedFramework: 'MITRE_ATLAS',
      frameworkVersion: '1.0',
      selectedTacticId: 'AML.TA0001',
      selectedTacticName: 'Reconnaissance',
      selectedVectors: ['vector-1'],
      selectedAttacks: ['attack-1'],
      objectives: null,
      user: { disabledAt: null },
    };

    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique
      .mockResolvedValueOnce(baseJob)
      .mockImplementation(async () => ({
        ...baseJob,
        status: 'RUNNING',
        workerLeaseId: mockUpdateMany.mock.calls[0]?.[0]?.data?.workerLeaseId,
      }));

    // Iteration 1 succeeds and accrues cost
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Test Attack',
          description: 'Desc',
          payload: 'Prompt',
          expected_failure_indicators: ['indicator-1'],
        }),
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
      })
      // Iteration 2 throws a transient provider error
      .mockRejectedValueOnce(new Error('Gemini 503 Service Unavailable'));

    mockCheckOriginality.mockResolvedValueOnce({
      passedDeterministic: true,
      embeddingTokens: 200,
      sha256Fingerprint: 'abc123',
      suspectMatches: [],
    });

    mockEvaluateCandidate.mockResolvedValueOnce({
      decision: 'ACCEPT',
      modelUsed: 'gemini-2.5-flash',
      inputTokens: 400,
      outputTokens: 100,
      originalityScore: 0.95,
      alignmentScore: 0.9,
    });
  }

  it('persists accrued totalCostUsd in the retryable catch updateMany path', async () => {
    setupTwoIterationFailure(0, 5);

    const result = await processGenerationJobStep({ jobId: 'job-1', geminiApiKey: 'test-key' });

    expect(result.status).toBe('RUNNING');
    expect(result.acceptedCount).toBe(1);

    const errorUpdateCall = mockUpdateMany.mock.calls.at(-1)?.[0];
    expect(errorUpdateCall.data.retryCount).toBe(1);
    expect(errorUpdateCall.data.acceptedCount).toBe(1);
    expect(errorUpdateCall.data.totalCostUsd).toEqual({ increment: expect.any(Number) });
    expect(errorUpdateCall.data.totalCostUsd.increment).toBeGreaterThan(0);
  });

  it('persists accrued totalCostUsd and counts when maxRetries is exhausted in catch path', async () => {
    setupTwoIterationFailure(4, 5);

    const result = await processGenerationJobStep({ jobId: 'job-1', geminiApiKey: 'test-key' });

    expect(result.status).toBe('FAILED');
    expect(result.acceptedCount).toBe(1);

    const terminalUpdateCall = mockUpdateMany.mock.calls.at(-1)?.[0];
    expect(terminalUpdateCall.data.status).toBe('FAILED');
    expect(terminalUpdateCall.data.retryCount).toBe(5);
    expect(terminalUpdateCall.data.acceptedCount).toBe(1);
    expect(terminalUpdateCall.data.totalCostUsd).toEqual({ increment: expect.any(Number) });
    expect(terminalUpdateCall.data.totalCostUsd.increment).toBeGreaterThan(0);
  });

  it('persists generator stepCostUsd immediately when originality check throws mid-iteration', async () => {
    const baseJob = {
      id: 'job-1',
      userId: 'user-1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 5,
      reservedCredits: 1,
      selectedFramework: 'MITRE_ATLAS',
      frameworkVersion: '1.0',
      selectedTacticId: 'AML.TA0001',
      selectedTacticName: 'Reconnaissance',
      selectedVectors: ['vector-1'],
      selectedAttacks: ['attack-1'],
      objectives: null,
      user: { disabledAt: null },
    };

    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindUnique
      .mockResolvedValueOnce(baseJob)
      .mockImplementation(async () => ({
        ...baseJob,
        status: 'RUNNING',
        workerLeaseId: mockUpdateMany.mock.calls[0]?.[0]?.data?.workerLeaseId,
      }));

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Mid-iteration Attack',
        description: 'Desc',
        payload: 'Prompt',
        expected_failure_indicators: ['indicator-1'],
      }),
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
    });

    mockCheckOriginality.mockRejectedValueOnce(new Error('Embedding service 503'));

    const result = await processGenerationJobStep({ jobId: 'job-1', geminiApiKey: 'test-key' });

    expect(result.status).toBe('RUNNING');
    const errorUpdateCall = mockUpdateMany.mock.calls.at(-1)?.[0];
    expect(errorUpdateCall.data.retryCount).toBe(1);
    expect(errorUpdateCall.data.totalCostUsd).toEqual({ increment: expect.any(Number) });
    expect(errorUpdateCall.data.totalCostUsd.increment).toBeGreaterThan(0);
  });

  it('preserves stepCostUsd and returns CANCELLED when leaseRelease matches 0 rows due to concurrent cancellation', async () => {
    const baseJob = {
      id: 'job-1',
      userId: 'user-1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 5,
      reservedCredits: 1,
      selectedFramework: 'MITRE_ATLAS',
      frameworkVersion: '1.0',
      selectedTacticId: 'AML.TA0001',
      selectedTacticName: 'Reconnaissance',
      selectedVectors: ['vector-1'],
      selectedAttacks: ['attack-1'],
      objectives: null,
      user: { disabledAt: null },
    };

    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // initial lease claim
      .mockResolvedValueOnce({ count: 0 }) // leaseRelease fails (job was cancelled concurrently)
      .mockResolvedValueOnce({ count: 1 }); // persistDroppedStepCost

    mockFindUnique
      .mockResolvedValueOnce(baseJob)
      .mockImplementationOnce(async () => ({
        ...baseJob,
        status: 'RUNNING',
        workerLeaseId: mockUpdateMany.mock.calls[0]?.[0]?.data?.workerLeaseId,
      }))
      .mockImplementationOnce(async () => ({
        ...baseJob,
        status: 'RUNNING',
        workerLeaseId: mockUpdateMany.mock.calls[0]?.[0]?.data?.workerLeaseId,
      }))
      .mockResolvedValueOnce({ status: 'CANCELLED', acceptedCount: 1 });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Test Attack',
        description: 'Desc',
        payload: 'Prompt',
        expected_failure_indicators: ['indicator-1'],
      }),
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
    });
    mockCheckOriginality.mockResolvedValueOnce({
      passedDeterministic: true,
      embeddingTokens: 200,
      sha256Fingerprint: 'abc123',
      suspectMatches: [],
    });
    mockEvaluateCandidate.mockResolvedValueOnce({
      decision: 'ACCEPT',
      modelUsed: 'gemini-2.5-flash',
      inputTokens: 400,
      outputTokens: 100,
      originalityScore: 0.95,
      alignmentScore: 0.9,
    });

    const result = await processGenerationJobStep({ jobId: 'job-1', geminiApiKey: 'test-key' });

    expect(result.status).toBe('CANCELLED');
    expect(result.hasMoreWork).toBe(false);

    const costIncrementCall = mockUpdateMany.mock.calls.at(-1)?.[0];
    expect(costIncrementCall.where).toEqual({ id: 'job-1' });
    expect(costIncrementCall.data).toEqual({ totalCostUsd: { increment: expect.any(Number) } });
    expect(costIncrementCall.data.totalCostUsd.increment).toBeGreaterThan(0);
  });

  it('preserves stepCostUsd and returns CANCELLED when catch updateMany matches 0 rows', async () => {
    const baseJob = {
      id: 'job-1',
      userId: 'user-1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 5,
      reservedCredits: 1,
      selectedFramework: 'MITRE_ATLAS',
      frameworkVersion: '1.0',
      selectedTacticId: 'AML.TA0001',
      selectedTacticName: 'Reconnaissance',
      selectedVectors: ['vector-1'],
      selectedAttacks: ['attack-1'],
      objectives: null,
      user: { disabledAt: null },
    };

    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // initial lease claim
      .mockResolvedValueOnce({ count: 0 }) // catch errorUpdate fails
      .mockResolvedValueOnce({ count: 1 }); // persistDroppedStepCost

    mockFindUnique
      .mockResolvedValueOnce(baseJob)
      .mockImplementationOnce(async () => ({
        ...baseJob,
        status: 'RUNNING',
        workerLeaseId: mockUpdateMany.mock.calls[0]?.[0]?.data?.workerLeaseId,
      }))
      .mockResolvedValueOnce({ status: 'CANCELLED', acceptedCount: 0 });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Mid-iteration Attack',
        description: 'Desc',
        payload: 'Prompt',
        expected_failure_indicators: ['indicator-1'],
      }),
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
    });
    mockCheckOriginality.mockRejectedValueOnce(new Error('Embedding service 503'));

    const result = await processGenerationJobStep({ jobId: 'job-1', geminiApiKey: 'test-key' });

    expect(result.status).toBe('CANCELLED');
    expect(result.hasMoreWork).toBe(false);

    const costIncrementCall = mockUpdateMany.mock.calls.at(-1)?.[0];
    expect(costIncrementCall.where).toEqual({ id: 'job-1' });
    expect(costIncrementCall.data).toEqual({ totalCostUsd: { increment: expect.any(Number) } });
    expect(costIncrementCall.data.totalCostUsd.increment).toBeGreaterThan(0);
  });

  it('guards releaseJobReservation with expectedLeaseId when maxRetries is exhausted', async () => {
    const baseJob = {
      id: 'job-1',
      userId: 'user-1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 4,
      maxRetries: 5,
      reservedCredits: 1,
      selectedFramework: 'MITRE_ATLAS',
      frameworkVersion: '1.0',
      selectedTacticId: 'AML.TA0001',
      selectedTacticName: 'Reconnaissance',
      selectedVectors: ['vector-1'],
      selectedAttacks: ['attack-1'],
      objectives: null,
      user: { disabledAt: null },
    };

    mockUpdateMany
      .mockResolvedValueOnce({ count: 1 }) // initial lease claim
      .mockResolvedValueOnce({ count: 0 }) // releaseJobReservation fails (lease stolen by replacement worker)
      .mockResolvedValueOnce({ count: 1 }); // persistDroppedStepCost

    mockFindUnique
      .mockResolvedValueOnce(baseJob)
      .mockImplementationOnce(async () => ({
        ...baseJob,
        status: 'RUNNING',
        workerLeaseId: mockUpdateMany.mock.calls[0]?.[0]?.data?.workerLeaseId,
      }))
      .mockResolvedValueOnce({ status: 'RUNNING', acceptedCount: 0 });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Mid-iteration Attack',
        description: 'Desc',
        payload: 'Prompt',
        expected_failure_indicators: ['indicator-1'],
      }),
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
    });
    mockCheckOriginality.mockRejectedValueOnce(new Error('Embedding service 503'));

    const result = await processGenerationJobStep({ jobId: 'job-1', geminiApiKey: 'test-key' });

    const claimedLeaseId = mockUpdateMany.mock.calls[0]?.[0]?.data?.workerLeaseId;
    const releaseAttemptWhere = mockUpdateMany.mock.calls[1]?.[0]?.where;
    expect(releaseAttemptWhere.workerLeaseId).toBe(claimedLeaseId);
    expect(mockCreditTransactionCreate).not.toHaveBeenCalled();
    expect(result.status).toBe('RUNNING');
  });
});
