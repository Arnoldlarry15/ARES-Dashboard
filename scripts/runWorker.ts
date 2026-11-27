import 'dotenv/config';
import prisma from '../utils/db';
import { processGenerationJobStep, recoverStalledJobs } from '../lib/jobs/generationJobService';

const POLL_INTERVAL_MS = Number(process.env.ARES_WORKER_POLL_MS || 5000);
const ONCE = process.argv.includes('--once');

let shuttingDown = false;
process.on('SIGINT', () => {
  shuttingDown = true;
});
process.on('SIGTERM', () => {
  shuttingDown = true;
});

async function runTick(geminiApiKey: string) {
  await recoverStalledJobs(geminiApiKey);

  const activeJobs = await prisma.generationJob.findMany({
    where: {
      status: { in: ['PENDING', 'RUNNING'] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }],
      AND: [{ OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] }]
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { id: true }
  });

  for (const job of activeJobs) {
    if (shuttingDown) break;
    try {
      const res = await processGenerationJobStep({ jobId: job.id, geminiApiKey });
      console.log(`[worker] job=${job.id} status=${res.status} accepted=${res.acceptedCount}/${res.requestedCount}`);
    } catch (err) {
      console.error(`[worker] job=${job.id} error:`, err instanceof Error ? err.message : err);
    }
  }
}

async function main() {
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  if (!geminiApiKey) {
    console.error('GEMINI_API_KEY is required to run the ARES background worker.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to run the ARES background worker.');
    process.exit(1);
  }

  console.log(`[worker] ARES background worker started (poll=${POLL_INTERVAL_MS}ms, once=${ONCE})`);
  do {
    await runTick(geminiApiKey);
    if (ONCE || shuttingDown) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  } while (!shuttingDown);

  await prisma.$disconnect();
  console.log('[worker] Shutdown complete.');
}

main().catch(async (err) => {
  console.error('[worker] Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
