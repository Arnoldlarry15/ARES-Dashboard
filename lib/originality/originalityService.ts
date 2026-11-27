import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import prisma from '../../utils/db';
import type { AttackPayload } from '../../types';

export const DEFAULT_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
export const DEFAULT_EMBEDDING_DIMENSIONS = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 768);
export const LEXICAL_SUSPECT_THRESHOLD = Number(process.env.ARES_LEXICAL_SUSPECT_THRESHOLD || 0.72);
export const LEXICAL_HARD_REJECT_THRESHOLD = Number(process.env.ARES_LEXICAL_REJECT_THRESHOLD || 0.92);
export const SEMANTIC_SUSPECT_THRESHOLD = Number(process.env.ARES_SEMANTIC_SUSPECT_THRESHOLD || 0.84);
export const SEMANTIC_CONCURRENT_REJECT_THRESHOLD = Number(process.env.ARES_SEMANTIC_CONCURRENT_REJECT_THRESHOLD || 0.92);
export const TOP_K_SEMANTIC_MATCHES = Number(process.env.ARES_TOP_K_MATCHES || 5);

export interface SuspectRegistryMatch {
  registryId: string;
  framework: string;
  attackVector: string;
  attackName: string;
  payloadText: string;
  lexicalSimilarity: number;
  semanticSimilarity: number;
  acquiredByUser: boolean;
}

export interface OriginalityCheckResult {
  passedDeterministic: boolean;
  rejectionStage?: 'EXACT_DUPLICATE' | 'LEXICAL' | 'SEMANTIC';
  rejectionReason?: string;
  sha256Fingerprint: string;
  normalizedTextHash: string;
  structuralSignature: string;
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingTokens: number;
  suspectMatches: SuspectRegistryMatch[];
  usedPgVector: boolean;
  checkStartedAt?: Date;
}

export function canonicalizePayloadText(text: string): string {
  return text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/\s+/g, ' '))
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeSha256Fingerprint(text: string): string {
  return crypto.createHash('sha256').update(text.trim(), 'utf8').digest('hex');
}

export function computeNormalizedTextHash(text: string): string {
  const normalized = canonicalizePayloadText(text);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function computeStructuralSignature(payload: AttackPayload): string {
  const keys = Object.keys(payload).sort().join(',');
  const lineCount = (payload.payload || '').split('\n').length;
  const hasJson = /\{[\s\S]*\}/.test(payload.payload || '');
  const hasCodeFence = /```/.test(payload.payload || '');
  return `${payload.format || 'Prompt'}|lines:${Math.min(lineCount, 20)}|json:${hasJson}|fence:${hasCodeFence}|keys:${keys}`;
}

export function tokenizeForJaccard(text: string): Set<string> {
  const words = canonicalizePayloadText(text).split(' ').filter(w => w.length > 2);
  const tokens = new Set<string>(words);
  for (let i = 0; i < words.length - 1; i++) {
    tokens.add(`${words[i]}_${words[i + 1]}`);
  }
  return tokens;
}

export function computeTokenJaccard(a: string, b: string): number {
  const setA = tokenizeForJaccard(a);
  const setB = tokenizeForJaccard(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecA.length !== vecB.length) {
    throw new Error(`Incompatible embedding dimensions: ${vecA.length} vs ${vecB.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function formatPgVectorLiteral(vec: number[]): string {
  return `[${vec.map(v => (Number.isFinite(v) ? v : 0)).join(',')}]`;
}

export async function generateGeminiEmbedding(params: {
  apiKey: string;
  text: string;
  model?: string;
  dimensions?: number;
  abortSignal?: AbortSignal;
}): Promise<{ embedding: number[]; model: string; dimensions: number; tokenCount: number }> {
  const model = params.model || DEFAULT_EMBEDDING_MODEL;
  const dimensions = params.dimensions || DEFAULT_EMBEDDING_DIMENSIONS;
  const genAI = new GoogleGenAI({ apiKey: params.apiKey });

  const response = await genAI.models.embedContent({
    model,
    contents: params.text,
    config: { outputDimensionality: dimensions, abortSignal: params.abortSignal }
  });

  const values = response.embeddings?.[0]?.values;
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('Gemini embedding response did not contain a valid vector');
  }

  return {
    embedding: values,
    model,
    dimensions: values.length,
    tokenCount: Math.ceil(params.text.length / 4)
  };
}

export async function isPgVectorAvailable(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ installed: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed
    `;
    return Boolean(rows[0]?.installed);
  } catch {
    return false;
  }
}

/**
 * Multi-stage deterministic + semantic originality check (Stages A, B, C).
 * Uses pgvector HNSW when available, falling back to PostgreSQL-native embeddingJson comparison.
 * Fails closed if originality verification cannot complete.
 */
export async function checkOriginalityAgainstRegistry(params: {
  userId: string;
  candidate: AttackPayload;
  apiKey: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  abortSignal?: AbortSignal;
  excludeRegistryId?: string;
}): Promise<OriginalityCheckResult> {
  const checkStartedAt = new Date();
  const payloadText = params.candidate.payload || '';
  const sha256Fingerprint = computeSha256Fingerprint(payloadText);
  const normalizedTextHash = computeNormalizedTextHash(payloadText);
  const structuralSignature = computeStructuralSignature(params.candidate);

  // Stage A: Exact & normalized hash check against GlobalPromptRegistry
  const exactMatch = await prisma.globalPromptRegistry.findFirst({
    where: {
      ...(params.excludeRegistryId ? { id: { not: params.excludeRegistryId } } : {}),
      OR: [{ sha256Fingerprint }, { normalizedTextHash }]
    },
    select: { id: true, sha256Fingerprint: true }
  });

  if (exactMatch) {
    return {
      passedDeterministic: false,
      rejectionStage: 'EXACT_DUPLICATE',
      rejectionReason:
        exactMatch.sha256Fingerprint === sha256Fingerprint
          ? 'Exact SHA-256 fingerprint match in Global Prompt Registry'
          : 'Normalized text hash match in Global Prompt Registry',
      sha256Fingerprint,
      normalizedTextHash,
      structuralSignature,
      embedding: [],
      embeddingModel: params.embeddingModel || DEFAULT_EMBEDDING_MODEL,
      embeddingDimensions: params.embeddingDimensions || DEFAULT_EMBEDDING_DIMENSIONS,
      embeddingTokens: 0,
      suspectMatches: [],
      usedPgVector: false,
      checkStartedAt
    };
  }

  // Stage C embedding generation (outside any DB lock; fails closed if embedding fails)
  const emb = await generateGeminiEmbedding({
    apiKey: params.apiKey,
    text: `${params.candidate.attack_name || ''}\n${params.candidate.attack_objective || ''}\n${payloadText}`,
    model: params.embeddingModel,
    dimensions: params.embeddingDimensions,
    abortSignal: params.abortSignal
  });

  const usedPgVector = (await isPgVectorAvailable()) && emb.dimensions === DEFAULT_EMBEDDING_DIMENSIONS;

  const userVaultRows = await prisma.customerPromptVault.findMany({
    where: { userId: params.userId },
    include: {
      registryPrompt: {
        select: {
          id: true,
          framework: true,
          attackVector: true,
          attackName: true,
          payload: true,
          embeddingModel: true,
          embeddingDimensions: true,
          embeddingJson: true
        }
      }
    }
  });
  const acquiredSet = new Set(userVaultRows.map(r => r.registryPromptId));

  const candidateMatchesMap = new Map<
    string,
    {
      id: string;
      framework: string;
      attackVector: string;
      attackName: string;
      payloadText: string;
      semanticSimilarity: number;
    }
  >();

  // Include customer's own acquired prompts for direct history comparison
  for (const v of userVaultRows) {
    const rp = v.registryPrompt;
    if (params.excludeRegistryId && rp.id === params.excludeRegistryId) continue;
    const rowPayload = rp.payload as unknown as AttackPayload;
    let semanticSimilarity = 0;
    if (
      rp.embeddingModel === emb.model &&
      rp.embeddingDimensions === emb.dimensions &&
      Array.isArray(rp.embeddingJson) &&
      rp.embeddingJson.length === emb.dimensions
    ) {
      semanticSimilarity = cosineSimilarity(emb.embedding, rp.embeddingJson);
    }
    candidateMatchesMap.set(rp.id, {
      id: rp.id,
      framework: rp.framework,
      attackVector: rp.attackVector,
      attackName: rp.attackName,
      payloadText: rowPayload?.payload || '',
      semanticSimilarity
    });
  }

  // Stage C global retrieval: pgvector HNSW when available, else Postgres-native fallback
  if (usedPgVector) {
    const vectorLiteral = formatPgVectorLiteral(emb.embedding);
    const limit = TOP_K_SEMANTIC_MATCHES * 4;
    const pgRows = await prisma.$queryRaw<
      Array<{
        id: string;
        framework: string;
        attackVector: string;
        attackName: string;
        payload: unknown;
        semanticSimilarity: number;
      }>
    >`
      SELECT
        id,
        framework,
        "attackVector",
        "attackName",
        payload,
        1 - ("embeddingVector" <=> ${vectorLiteral}::vector) AS "semanticSimilarity"
      FROM "global_prompt_registry"
      WHERE "embeddingModel" = ${emb.model}
        AND "embeddingDimensions" = ${emb.dimensions}
        AND "embeddingVector" IS NOT NULL
      ORDER BY "embeddingVector" <=> ${vectorLiteral}::vector ASC
      LIMIT ${limit}
    `;

    for (const row of pgRows) {
      if (params.excludeRegistryId && row.id === params.excludeRegistryId) continue;
      const rowPayload = row.payload as unknown as AttackPayload;
      candidateMatchesMap.set(row.id, {
        id: row.id,
        framework: row.framework,
        attackVector: row.attackVector,
        attackName: row.attackName,
        payloadText: rowPayload?.payload || '',
        semanticSimilarity: Number(row.semanticSimilarity || 0)
      });
    }
  } else {
    const fallbackRows = await prisma.globalPromptRegistry.findMany({
      where: {
        ...(params.excludeRegistryId ? { id: { not: params.excludeRegistryId } } : {}),
        embeddingModel: emb.model,
        embeddingDimensions: emb.dimensions
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        framework: true,
        attackVector: true,
        attackName: true,
        payload: true,
        embeddingJson: true
      }
    });

    for (const row of fallbackRows) {
      const rowPayload = row.payload as unknown as AttackPayload;
      const semanticSimilarity =
        Array.isArray(row.embeddingJson) && row.embeddingJson.length === emb.dimensions
          ? cosineSimilarity(emb.embedding, row.embeddingJson)
          : 0;
      candidateMatchesMap.set(row.id, {
        id: row.id,
        framework: row.framework,
        attackVector: row.attackVector,
        attackName: row.attackName,
        payloadText: rowPayload?.payload || '',
        semanticSimilarity
      });
    }
  }

  // Also include recent global rows for Stage B lexical comparison even if embedding models differ
  const recentLexicalRows = await prisma.globalPromptRegistry.findMany({
    where: params.excludeRegistryId ? { id: { not: params.excludeRegistryId } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      framework: true,
      attackVector: true,
      attackName: true,
      payload: true
    }
  });
  for (const row of recentLexicalRows) {
    if (!candidateMatchesMap.has(row.id)) {
      const rowPayload = row.payload as unknown as AttackPayload;
      candidateMatchesMap.set(row.id, {
        id: row.id,
        framework: row.framework,
        attackVector: row.attackVector,
        attackName: row.attackName,
        payloadText: rowPayload?.payload || '',
        semanticSimilarity: 0
      });
    }
  }

  const scoredMatches: SuspectRegistryMatch[] = [];
  for (const item of candidateMatchesMap.values()) {
    const lexicalSimilarity = computeTokenJaccard(payloadText, item.payloadText);

    if (lexicalSimilarity >= LEXICAL_HARD_REJECT_THRESHOLD) {
      return {
        passedDeterministic: false,
        rejectionStage: 'LEXICAL',
        rejectionReason: `Lexical similarity (${lexicalSimilarity.toFixed(2)}) exceeded hard rejection threshold (${LEXICAL_HARD_REJECT_THRESHOLD})`,
        sha256Fingerprint,
        normalizedTextHash,
        structuralSignature,
        embedding: emb.embedding,
        embeddingModel: emb.model,
        embeddingDimensions: emb.dimensions,
        embeddingTokens: emb.tokenCount,
        suspectMatches: [
          {
            registryId: item.id,
            framework: item.framework,
            attackVector: item.attackVector,
            attackName: item.attackName,
            payloadText: item.payloadText,
            lexicalSimilarity,
            semanticSimilarity: item.semanticSimilarity,
            acquiredByUser: acquiredSet.has(item.id)
          }
        ],
        usedPgVector,
        checkStartedAt
      };
    }

    if (lexicalSimilarity >= LEXICAL_SUSPECT_THRESHOLD || item.semanticSimilarity >= SEMANTIC_SUSPECT_THRESHOLD) {
      scoredMatches.push({
        registryId: item.id,
        framework: item.framework,
        attackVector: item.attackVector,
        attackName: item.attackName,
        payloadText: item.payloadText,
        lexicalSimilarity,
        semanticSimilarity: item.semanticSimilarity,
        acquiredByUser: acquiredSet.has(item.id)
      });
    }
  }

  scoredMatches.sort(
    (a, b) => Math.max(b.semanticSimilarity, b.lexicalSimilarity) - Math.max(a.semanticSimilarity, a.lexicalSimilarity)
  );

  return {
    passedDeterministic: true,
    sha256Fingerprint,
    normalizedTextHash,
    structuralSignature,
    embedding: emb.embedding,
    embeddingModel: emb.model,
    embeddingDimensions: emb.dimensions,
    embeddingTokens: emb.tokenCount,
    suspectMatches: scoredMatches.slice(0, TOP_K_SEMANTIC_MATCHES),
    usedPgVector,
    checkStartedAt
  };
}

/**
 * Concurrency-safe acceptance into GlobalPromptRegistry using PostgreSQL transaction-scoped advisory lock.
 * Rechecks exact/normalized hashes AND inside-lock lexical + cosine similarity against rows inserted
 * concurrently since checkStartedAt before committing.
 */
export async function acceptCandidateIntoRegistryWithLock(params: {
  candidate: AttackPayload;
  framework: string;
  frameworkVersion: string;
  attackVector: string;
  attackName: string;
  originality: OriginalityCheckResult;
  originalityMetadata: Record<string, unknown>;
  acceptanceStatus?: 'ACCEPTED' | 'ACCEPTED_UNDELIVERED';
  jobId?: string;
  expectedLeaseId?: string;
}): Promise<{ registryId: string }> {
  const payloadText = params.candidate.payload || '';
  const checkStartedAt = params.originality.checkStartedAt || new Date(0);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ares_global_prompt_registry'))`;

    if (params.jobId && params.expectedLeaseId) {
      const activeJob = await tx.generationJob.findUnique({
        where: { id: params.jobId },
        select: { status: true, workerLeaseId: true, leaseExpiresAt: true }
      });
      if (
        !activeJob ||
        activeJob.status !== 'RUNNING' ||
        activeJob.workerLeaseId !== params.expectedLeaseId ||
        (activeJob.leaseExpiresAt && activeJob.leaseExpiresAt < new Date())
      ) {
        throw new Error('STALE_WORKER_LEASE');
      }
    }

    const duplicate = await tx.globalPromptRegistry.findFirst({
      where: {
        OR: [
          { sha256Fingerprint: params.originality.sha256Fingerprint },
          { normalizedTextHash: params.originality.normalizedTextHash }
        ]
      },
      select: { id: true }
    });

    if (duplicate) {
      throw new Error('CONCURRENCY_DUPLICATE_DETECTED');
    }

    // Inside-lock lexical & cosine similarity recheck against rows committed after checkStartedAt
    const concurrentRows = await tx.globalPromptRegistry.findMany({
      where: { createdAt: { gte: checkStartedAt } },
      select: {
        id: true,
        payload: true,
        embeddingModel: true,
        embeddingDimensions: true,
        embeddingJson: true
      }
    });

    for (const row of concurrentRows) {
      const rowPayload = row.payload as unknown as AttackPayload;
      const rowText = rowPayload?.payload || '';
      if (computeTokenJaccard(payloadText, rowText) >= LEXICAL_HARD_REJECT_THRESHOLD) {
        throw new Error('CONCURRENCY_DUPLICATE_DETECTED');
      }
      if (
        params.originality.embedding.length > 0 &&
        row.embeddingModel === params.originality.embeddingModel &&
        row.embeddingDimensions === params.originality.embeddingDimensions &&
        Array.isArray(row.embeddingJson) &&
        row.embeddingJson.length === params.originality.embeddingDimensions
      ) {
        const sim = cosineSimilarity(params.originality.embedding, row.embeddingJson);
        if (sim >= SEMANTIC_CONCURRENT_REJECT_THRESHOLD) {
          throw new Error('CONCURRENCY_DUPLICATE_DETECTED');
        }
      }
    }

    const created = await tx.globalPromptRegistry.create({
      data: {
        sha256Fingerprint: params.originality.sha256Fingerprint,
        normalizedTextHash: params.originality.normalizedTextHash,
        structuralSignature: params.originality.structuralSignature,
        framework: params.framework,
        frameworkVersion: params.frameworkVersion,
        attackVector: params.attackVector,
        attackName: params.attackName,
        payload: params.candidate as unknown as object,
        embeddingModel: params.originality.embeddingModel,
        embeddingDimensions: params.originality.embeddingDimensions,
        embeddingJson: params.originality.embedding,
        originalityMetadata: params.originalityMetadata as unknown as object,
        acceptanceStatus: params.acceptanceStatus || 'ACCEPTED'
      },
      select: { id: true }
    });

    if (
      params.originality.usedPgVector &&
      params.originality.embedding.length === DEFAULT_EMBEDDING_DIMENSIONS
    ) {
      const vectorLiteral = formatPgVectorLiteral(params.originality.embedding);
      await tx.$executeRaw`
        UPDATE "global_prompt_registry"
        SET "embeddingVector" = ${vectorLiteral}::vector
        WHERE id = ${created.id}
      `;
    }

    return { registryId: created.id };
  });
}
