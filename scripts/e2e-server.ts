import { spawn } from 'node:child_process';
import path from 'node:path';
import { createDatabase, migrate } from '../src/lib/db';
import { seed } from '../src/lib/seed';
const base = path.resolve('.local', `e2e-${Date.now()}`);
delete process.env.FORCE_COLOR;
Object.assign(process.env, {
  LOCAL_DEVELOPMENT: 'true',
  INLINE_WORKER: 'true',
  WORKER_USER_ID: 'es2',
  AUTH_MODE: 'local',
  DB_DRIVER: 'pglite',
  PGLITE_DIR: path.join(base, 'database'),
  EVIDENCE_PROVIDER: 'local',
  EVIDENCE_DIR: path.join(base, 'evidence'),
  APP_URL: 'http://127.0.0.1:3100',
  NEXT_TELEMETRY_DISABLED: '1',
});
const db = await createDatabase();
try {
  await migrate(db);
  await seed(db);
} finally {
  await db.close();
}
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--port', '3100', '--hostname', '127.0.0.1'],
  { stdio: 'inherit', windowsHide: true, env: { ...process.env, NEXT_DIST_DIR: '.next-e2e' } },
);
process.on('SIGINT', () => server.kill());
process.on('SIGTERM', () => server.kill());
server.on('exit', (code) => {
  process.exitCode = code || 0;
});
