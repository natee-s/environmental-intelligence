import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { DB } from './db';
import { actorById, demoViewerId, DomainError, fail, hash, id, insert, type Actor } from './core';
export const cookieName = 'env_session';
export const token = () => randomBytes(32).toString('base64url');
export async function session(db: DB, userId: string, demoAccessHash: string | null = null) {
  const value = token();
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at,demo_access_hash) VALUES($1,$2,now()+interval '8 hours',$3)",
    [hash(value), userId, demoAccessHash],
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
  const rows = await db.query<{ user_id: string; demo_access_hash: string | null }>(
    'SELECT user_id,demo_access_hash FROM sessions WHERE token_hash=$1 AND expires_at>now()',
    [hash(value)],
  );
  if (!rows.rows.length) fail('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
  try {
    const actor = await actorById(db, rows.rows[0].user_id);
    if (process.env.AUTH_MODE === 'hosted-demo') {
      hostedDemoConfig();
      if (
        actor.id !== demoViewerId ||
        !actor.demo ||
        rows.rows[0].demo_access_hash !== hash(process.env.DEMO_ACCESS_CODE)
      )
        fail('กรุณาเข้าสู่ Demo ใหม่', 401);
      const allowed = await db.query(
        "SELECT id FROM sites WHERE id='site-a' AND organization_id=$1 AND demo=true",
        [actor.organization_id],
      );
      if (!allowed.rows.length) fail('ไม่มีพื้นที่ Demo ที่อนุญาต', 403);
      actor.grants = actor.grants.filter((g) => g.site_id === 'site-a' && g.role === 'MG');
    }
    return actor;
  } catch {
    throw new DomainError(401, 'บัญชีถูกระงับหรือไม่มีสิทธิ์');
  }
}
export function hostedDemoConfig() {
  if (
    process.env.AUTH_MODE !== 'hosted-demo' ||
    process.env.LOCAL_DEVELOPMENT !== 'false' ||
    process.env.DB_DRIVER !== 'postgres' ||
    !process.env.APP_URL?.startsWith('https://') ||
    (process.env.DEMO_ACCESS_CODE?.length || 0) < 16
  )
    fail('Demo ออนไลน์ยังไม่ได้ตั้งค่าอย่างครบถ้วน', 503);
}
export async function provisionDemoViewer(db: DB) {
  hostedDemoConfig();
  const realSites = await db.query('SELECT 1 FROM sites WHERE demo=false LIMIT 1');
  if (realSites.rows.length) fail('Demo ออนไลน์ต้องใช้ฐานข้อมูล Demo แยกต่างหาก', 503);
  await db.query(
    "INSERT INTO users(id,organization_id,email,name,active,demo) VALUES($1,'demo-org','viewer@demo.local','นาย I • ผู้เข้าชม Demo',true,true) ON CONFLICT(id) DO NOTHING",
    [demoViewerId],
  );
  await db.query("INSERT INTO grants(user_id,site_id,role) VALUES($1,'site-a','MG') ON CONFLICT DO NOTHING", [
    demoViewerId,
  ]);
}
export async function loginHostedDemo(db: DB, code: unknown) {
  hostedDemoConfig();
  rateLimit('hosted-demo-login');
  if (
    typeof code !== 'string' ||
    code.length > 256 ||
    !timingSafeEqual(Buffer.from(hash(code), 'hex'), Buffer.from(hash(process.env.DEMO_ACCESS_CODE), 'hex'))
  )
    fail('รหัสเข้าชมไม่ถูกต้อง', 401);
  const actor = await actorById(db, demoViewerId);
  if (
    !actor.demo ||
    actor.organization_id !== 'demo-org' ||
    !actor.grants.some((g) => g.site_id === 'site-a' && g.role === 'MG')
  )
    fail('บัญชีผู้เข้าชม Demo ไม่พร้อมใช้งาน', 403);
  return session(db, actor.id, hash(process.env.DEMO_ACCESS_CODE));
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
