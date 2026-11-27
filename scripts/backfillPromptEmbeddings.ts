import 'dotenv/config';
import prisma from '../utils/db';
import type { AttackPayload } from '../types';
import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  formatPgVectorLiteral,
  generateGeminiEmbedding,
  isPgVectorAvailable
} from '../lib/originality/originalityService';

const TARGET_VECTOR_DIMENSIONS = 768;

async function withRetries<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export async function backfillEmbeddings(options?: {
  batchSize?: number;
  dryRun?: boolean;
}) {
  const batchSize = options?.batchSize || 25;
  const dryRun = Boolean(options?.dryRun);
  const pgvectorReady = await isPgVectorAvailable();

  if (DEFAULT_EMBEDDING_DIMENSIONS !== TARGET_VECTOR_DIMENSIONS) {
    throw new Error(
      `Schema vector(768) requires DEFAULT_EMBEDDING_DIMENSIONS=768 (got ${DEFAULT_EMBEDDING_DIMENSIONS})`
    );
  }

  let syncedFromJson = 0;
  let reembedded = 0;
  let failed = 0;
  let lastId: string | undefined;

  while (true) {
    // Query candidate rows via raw SQL so we can inspect NULL embeddingVector alongside embeddingJson
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        embeddingModel: string;
        embeddingDimensions: number;
        embeddingJson: number[];
        hasVector: boolean;
      }>
    >`
      SELECT
        id,
        "embeddingModel",
        "embeddingDimensions",
        "embeddingJson",
        ("embeddingVector" IS NOT NULL) AS "hasVector"
      FROM "global_prompt_registry"
      WHERE (${lastId ?? null}::text IS NULL OR id > ${lastId ?? ''})
        AND (
          "embeddingVector" IS NULL
          OR COALESCE(array_length("embeddingJson", 1), 0) <> ${TARGET_VECTOR_DIMENSIONS}
          OR "embeddingModel" <> ${DEFAULT_EMBEDDING_MODEL}
          OR "embeddingDimensions" <> ${TARGET_VECTOR_DIMENSIONS}
        )
      ORDER BY id ASC
      LIMIT ${batchSize}
    `;

    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.id;
      const hasValidJson =
        Array.isArray(row.embeddingJson) &&
        row.embeddingJson.length === TARGET_VECTOR_DIMENSIONS &&
        row.embeddingModel === DEFAULT_EMBEDDING_MODEL &&
        row.embeddingDimensions === TARGET_VECTOR_DIMENSIONS;

      try {
        if (hasValidJson && !row.hasVector) {
          if (pgvectorReady && !dryRun) {
            const vectorLiteral = formatPgVectorLiteral(row.embeddingJson);
            await prisma.$executeRaw`
              UPDATE "global_prompt_registry"
              SET "embeddingVector" = ${vectorLiteral}::vector
              WHERE id = ${row.id} AND "embeddingVector" IS NULL
            `;
          }
          syncedFromJson++;
          continue;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('GEMINI_API_KEY is required to re-embed rows missing compatible 768-dim embeddings');
        }

        const fullRow = await prisma.globalPromptRegistry.findUnique({
          where: { id: row.id },
          select: { id: true, payload: true }
        });
        if (!fullRow) continue;

        const payload = fullRow.payload as unknown as AttackPayload;
        if (dryRun) {
          reembedded++;
          continue;
        }

        const emb = await withRetries(() =>
          generateGeminiEmbedding({
            apiKey,
            text: `${payload.attack_name || ''}\n${payload.attack_objective || ''}\n${payload.payload || ''}`,
            model: DEFAULT_EMBEDDING_MODEL,
            dimensions: TARGET_VECTOR_DIMENSIONS,
            abortSignal: AbortSignal.timeout(20_000)
          })
        );

        await prisma.globalPromptRegistry.update({
          where: { id: row.id },
          data: {
            embeddingModel: emb.model,
            embeddingDimensions: emb.dimensions,
            embeddingJson: emb.embedding
          }
        });

        if (pgvectorReady && emb.embedding.length === TARGET_VECTOR_DIMENSIONS) {
          const vectorLiteral = formatPgVectorLiteral(emb.embedding);
          await prisma.$executeRaw`
            UPDATE "global_prompt_registry"
            SET "embeddingVector" = ${vectorLiteral}::vector
            WHERE id = ${row.id}
          `;
        }

        reembedded++;
      } catch (err) {
        failed++;
        console.error(`[backfill] row=${row.id} failed:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(
      `[backfill] progress lastId=${lastId} syncedFromJson=${syncedFromJson} reembedded=${reembedded} failed=${failed}`
    );
  }

  console.log(
    `[backfill] complete pgvector=${pgvectorReady} dryRun=${dryRun} syncedFromJson=${syncedFromJson} reembedded=${reembedded} failed=${failed}`
  );
  return { pgvectorReady, dryRun, syncedFromJson, reembedded, failed };
}

const isDirectRun = process.argv[1]?.includes('backfillPromptEmbeddings');
if (isDirectRun) {
  const dryRun = process.argv.includes('--dry-run');
  const batchArg = process.argv.find((a) => a.startsWith('--batch-size='));
  const batchSize = batchArg ? Math.max(1, parseInt(batchArg.split('=')[1], 10) || 25) : 25;

  backfillEmbeddings({ batchSize, dryRun })
    .then(async (res) => {
      await prisma.$disconnect();
      if (res.failed > 0) process.exit(1);
    })
    .catch(async (err) => {
      console.error('[backfill] Fatal error:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
