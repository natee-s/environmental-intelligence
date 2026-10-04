import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createDatabase, migrate } from '../src/lib/db';
import { seed } from '../src/lib/seed';
import { provisionDemoViewer } from '../src/lib/auth';

// Render supplies this URL at runtime, including for a newly assigned subdomain.
if (!process.env.APP_URL && process.env.RENDER_EXTERNAL_URL)
  process.env.APP_URL = process.env.RENDER_EXTERNAL_URL;
if (process.env.LOCAL_DEVELOPMENT === 'true' || process.env.DB_DRIVER !== 'postgres')
  throw new Error('Hosted deployment requires PostgreSQL and LOCAL_DEVELOPMENT=false');
if (!process.env.DATABASE_URL || !process.env.APP_URL?.startsWith('https://'))
  throw new Error('Hosted deployment requires DATABASE_URL and an HTTPS APP_URL');

const db = await createDatabase();
try {
  // A transaction lock serializes setup when two deployments overlap.
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [17392026]);
    // Setup has its own transactions; do not hold seed rows uncommitted while
    // domain commands open their separate approval transactions.
    await migrate(db);
    if (process.env.SEED_DEMO === 'true') {
      const realSites = await db.query('SELECT 1 FROM sites WHERE demo=false LIMIT 1');
      if (realSites.rows.length) throw new Error('Refusing Demo seed in a database containing real sites');
      await seed(db);
    }
    if (process.env.AUTH_MODE === 'hosted-demo') await provisionDemoViewer(db);
  });
  console.log('Hosted database setup completed.');
} finally {
  await db.close();
}

const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'start',
    '--hostname',
    '0.0.0.0',
    '--port',
    process.env.PORT || '10000',
  ],
  { stdio: 'inherit', env: process.env },
);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Unable to start Next.js');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
