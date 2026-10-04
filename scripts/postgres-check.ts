import EmbeddedPostgres from 'embedded-postgres';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
const dir = path.resolve('.local', `postgres-check-${Date.now()}`);
await mkdir(dir, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'environment',
  password: 'local-test-only',
  port: 55433,
  persistent: true,
  postgresFlags: ['-h', '127.0.0.1'],
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (message) => console.error(String(message)),
});
// Use PostgreSQL's graceful shutdown on Windows, rather than taskkill /force.
if (process.platform === 'win32') {
  let stopped = false;
  pg.stop = async () => {
    if (stopped) return;
    await promisify(execFile)(
      path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
      ['stop', '-D', dir, '-m', 'fast', '-w', '-t', '15'],
      { windowsHide: true },
    );
    stopped = true;
  };
}
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('p1_acceptance');
  console.log('PostgreSQL acceptance server: loopback:55433');
  const result = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', '--test', 'tests/domain.test.ts'], {
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        DB_DRIVER: 'postgres',
        DATABASE_URL: 'postgresql://environment:local-test-only@127.0.0.1:55433/p1_acceptance',
        TEST_DATABASE_URL: 'postgresql://environment:local-test-only@127.0.0.1:55433/p1_acceptance',
      },
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code || 0));
  });
  process.exitCode = result;
} finally {
  await pg.stop();
  console.log('PostgreSQL acceptance server stopped.');
}
