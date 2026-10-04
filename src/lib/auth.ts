import { randomBytes } from 'node:crypto';
import type { DB } from './db';
import { actorById, DomainError, fail, hash, id, insert, type Actor } from './core';
export const cookieName = 'env_session';
export const token = () => randomBytes(32).toString('base64url');
export async function session(db: DB, userId: string) {
  const value = token();
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
    [hash(value), userId],
  );
  return value;
}
export async function authenticate(db: DB, req: Request): Promise<Actor> {
  const value = req.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  if (!value) fail('กรุณาเข้าสู่ระบบ', 401);
  const rows = await db.query<{ user_id: string }>(
    'SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',
    [hash(value)],
  );
  if (!rows.rows.length) fail('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
  try {
    return await actorById(db, rows.rows[0].user_id);
  } catch {
    throw new DomainError(401, 'บัญชีถูกระงับหรือไม่มีสิทธิ์');
  }
}
export function localOnly(req: Request) {
  const host = new URL('http://' + (req.headers.get('host') || 'invalid')).hostname;
  const configured = new URL(process.env.APP_URL || 'http://localhost:3000').hostname;
  if (
    process.env.LOCAL_DEVELOPMENT !== 'true' ||
    process.env.AUTH_MODE !== 'local' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(host) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(configured)
  )
    fail('Local Demo login ไม่เปิดใช้งาน', 403);
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const configured = new URL(process.env.APP_URL || 'http://localhost:3000');
  const allowed = new Set([configured.origin]);
  if (process.env.LOCAL_DEVELOPMENT === 'true' && ['localhost', '127.0.0.1'].includes(configured.hostname))
    for (const host of ['localhost', '127.0.0.1'])
      allowed.add(`${configured.protocol}//${host}${configured.port ? ':' + configured.port : ''}`);
  if (!origin || !allowed.has(origin) || new URL(origin).host !== req.headers.get('host'))
    fail('Origin ไม่ถูกต้อง', 403);
}
export async function authEvent(db: DB, userId: string | null, action: string) {
  const sites = userId
    ? (
        await db.query<{ site_id: string }>('SELECT DISTINCT site_id FROM grants WHERE user_id=$1', [userId])
      ).rows.map((r) => r.site_id)
    : [];
  for (const site of sites.length ? sites : [null])
    await insert(db, 'events', {
      id: id(),
      site_id: site,
      actor_id: userId,
      entity_type: 'auth',
      entity_id: userId || 'anonymous',
      action,
    });
}
const limits = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string) {
  const now = Date.now();
  const r = limits.get(key);
  if (!r || now - r.start > 60000) {
    limits.set(key, { start: now, count: 1 });
    return;
  }
  if (++r.count > 30) fail('คำขอมากเกินไป กรุณารอสักครู่', 429);
}
