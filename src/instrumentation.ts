export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.INLINE_WORKER === 'true' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const runtime = globalThis as unknown as { environmentWorker?: () => void };
    if (runtime.environmentWorker) return;
    const { database } = await import('./lib/db');
    const { startWorker } = await import('./lib/worker');
    runtime.environmentWorker = startWorker(await database(), process.env.WORKER_USER_ID);
  }
}
