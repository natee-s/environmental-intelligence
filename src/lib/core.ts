import { createHash, randomUUID } from 'node:crypto';
import type { DB } from './db';
// Database rows are decoded at the service boundary; JSON config is validated by kind.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Actor = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  demo: boolean;
  grants: { site_id: string; role: string }[];
};
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(message: string, status = 422): never {
  throw new DomainError(status, message);
}
export const id = () => randomUUID();
export const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
export const categories = ['WATER', 'WASTEWATER', 'ENERGY', 'WASTE', 'PRODUCTION'];
export const localDate = (timezone = 'Asia/Bangkok', instant = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
export const dateString = (d: unknown) =>
  d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
export const dateRange = (from: string, to: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from)
    fail('ช่วงวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD');
  const count = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (!Number.isFinite(count) || count > 366) fail('เลือกช่วงเวลาไม่เกิน 366 วัน');
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10),
  );
};
export async function one(db: DB, sql: string, params: unknown[] = []): Promise<Row> {
  return (await db.query<Row>(sql, params)).rows[0] ?? fail('ไม่พบรายการหรือไม่มีสิทธิ์เข้าถึง', 404);
}
export async function actorById(db: DB, userId: string): Promise<Actor> {
  const u = await one(db, 'SELECT * FROM users WHERE id=$1 AND active=true', [userId]);
  return {
    ...u,
    grants: (await db.query('SELECT site_id,role FROM grants WHERE user_id=$1', [userId])).rows,
  } as Actor;
}
export function roles(actor: Actor, site: string) {
  return actor.grants.filter((g) => g.site_id === site).map((g) => g.role);
}
export const permissions: Record<string, string[]> = {
  read: ['EO', 'DO', 'ES', 'MG', 'AV'],
  entry: ['EO', 'ES'],
  review: ['ES'],
  issue: ['EO', 'DO', 'ES'],
  assign: ['ES'],
  work: ['EO', 'DO', 'ES'],
  verify: ['ES'],
  report: ['EO', 'ES'],
  export: ['EO', 'ES', 'MG'],
  config: ['SA', 'ES'],
  users: ['SA'],
  audit: ['ES', 'SA', 'AV'],
};
export function can(actor: Actor, site: string, permission: string) {
  return roles(actor, site).some((r) => (permissions[permission] || []).includes(r));
}
export function authorize(actor: Actor, site: string, permission: string) {
  if (!can(actor, site, permission)) fail('ไม่มีสิทธิ์ดำเนินการในพื้นที่นี้', 403);
}
export function required(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`กรุณาระบุ${label}`);
  return (value as string).trim();
}
export function separate(actor: Actor, ...makers: (string | null | undefined)[]) {
  if (makers.includes(actor.id))
    fail('ผู้สร้าง ผู้ส่ง หรือผู้ทำงานไม่สามารถตรวจอนุมัติรายการของตนเองได้', 403);
}
export function conflict(row: Row, version: unknown, field = 'version') {
  if (row[field] !== Number(version))
    fail('ข้อมูลมีการเปลี่ยนแปลงแล้ว กรุณาโหลดรุ่นล่าสุดก่อนบันทึก (conflict)', 409);
}
export async function insert(db: DB, table: string, data: Row): Promise<Row> {
  const keys = Object.keys(data);
  return one(
    db,
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
    Object.values(data),
  );
}
export async function event(
  db: DB,
  actor: Actor,
  site: string,
  type: string,
  entity: string,
  action: string,
  before: unknown = null,
  after: unknown = null,
  reason = '',
) {
  return insert(db, 'events', {
    id: id(),
    site_id: site,
    actor_id: actor.id,
    entity_type: type,
    entity_id: entity,
    action,
    reason,
    before_data: before ? JSON.stringify(before) : null,
    after_data: after ? JSON.stringify(after) : null,
  });
}
export async function notify(
  db: DB,
  site: string,
  eventId: string,
  recipients: string[],
  title: string,
  href: string,
) {
  for (const user of new Set(recipients.filter(Boolean)))
    await db.query(
      'INSERT INTO notifications(id,site_id,user_id,event_id,title,href) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM grants g JOIN users u ON u.id=g.user_id WHERE g.user_id=$3 AND g.site_id=$2 AND u.active=true) ON CONFLICT(user_id,event_id) DO NOTHING',
      [id(), site, user, eventId, title, href],
    );
}
export async function supervisors(db: DB, site: string) {
  return (
    await db.query<Row>("SELECT DISTINCT user_id FROM grants WHERE site_id=$1 AND role='ES'", [site])
  ).rows.map((r) => r.user_id as string);
}
export async function activeMasters(db: DB, site: string, kind?: string, date = localDate()) {
  return (
    await db.query<Row>(
      'SELECT * FROM master_versions WHERE site_id=$1 AND approved_by IS NOT NULL AND effective_from<=$2::date AND (effective_to IS NULL OR effective_to>=$2::date) ' +
        (kind ? 'AND kind=$3 ' : '') +
        'ORDER BY version DESC',
      [site, date, ...(kind ? [kind] : [])],
    )
  ).rows.filter((r, i, a) => a.findIndex((x) => x.kind === r.kind && x.code === r.code) === i);
}
