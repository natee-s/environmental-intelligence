import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { Pool, types } from 'pg';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export interface DB {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function createDatabase(memory = false): Promise<DB> {
  if (!memory && process.env.DB_DRIVER === 'postgres') {
    // A SQL DATE is a site-local calendar date, never a host-timezone instant.
    types.setTypeParser(1082, (value) => value);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const wrap = (client: Pick<Pool, 'query'>): DB => ({
      query: async <T>(s: string, p?: unknown[]) => ({ rows: (await client.query(s, p)).rows as T[] }),
      exec: (s) => client.query(s),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const result = await fn(wrap(c));
          await c.query('COMMIT');
          return result;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    });
    return wrap(pool);
  }
  if (!memory && process.env.LOCAL_DEVELOPMENT !== 'true')
    throw new Error('PGlite requires LOCAL_DEVELOPMENT=true');
  const dir = path.resolve(process.env.PGLITE_DIR || '.local/database');
  if (!memory) await mkdir(dir, { recursive: true });
  const pg = new PGlite(memory ? undefined : dir);
  const wrap = (p: Pick<PGlite, 'query' | 'exec' | 'transaction'>): DB => ({
    query: async <T>(s: string, args?: unknown[]) => p.query<T>(s, args),
    exec: (s) => p.exec(s),
    transaction: (fn) => p.transaction((tx) => fn(wrap(tx as unknown as PGlite))),
    close: () => pg.close(),
  });
  return wrap(pg);
}
const globalDB = globalThis as unknown as { environmentDb?: Promise<DB> };
export function database() {
  return (globalDB.environmentDb ??= createDatabase());
}
export async function migrate(db: DB) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  for (const file of (await readdir(path.resolve('migrations'))).filter((f) => f.endsWith('.sql')).sort()) {
    if ((await db.query('SELECT name FROM schema_migrations WHERE name=$1', [file])).rows.length) continue;
    await db.transaction(async (tx) => {
      await tx.exec(await readFile(path.resolve('migrations', file), 'utf8'));
      await tx.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
    });
  }
}
