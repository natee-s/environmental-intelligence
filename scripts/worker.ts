import { createDatabase } from '../src/lib/db';
import { startWorker } from '../src/lib/worker';
if (process.env.DB_DRIVER !== 'postgres')
  throw new Error(
    'Separate worker requires DB_DRIVER=postgres. PGlite uses INLINE_WORKER in the same process.',
  );
const db = await createDatabase();
const stop = startWorker(db, process.env.WORKER_USER_ID);
const keepAlive = setInterval(() => {}, 60000);
async function shutdown() {
  stop();
  clearInterval(keepAlive);
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
console.log(
  'Import worker running; scheduled alerts:',
  process.env.WORKER_USER_ID ? 'enabled' : 'disabled (set WORKER_USER_ID to an approved ES account)',
);
