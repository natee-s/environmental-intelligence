import type { DB } from './db';
import { authorize, required, fail, one, insert, id, event, type Actor, type Row } from './core';
export async function siteCommand(db: DB, actor: Actor, site: string, action: string, input: Row) {
  authorize(actor, site, 'users');
  const current = await one(db, 'SELECT * FROM sites WHERE id=$1 AND organization_id=$2', [
    site,
    actor.organization_id,
  ]);
  required(input.reason, 'เหตุผล');
  const name = required(input.name, 'ชื่อ Site'),
    timezone = required(input.timezone, 'เขตเวลา');
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    fail('เขตเวลา IANA ไม่ถูกต้อง');
  }
  if (action === 'site.create') {
    const code = required(input.code, 'รหัส Site');
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(code)) fail('รหัส Site ใช้ตัวอักษรอังกฤษ ตัวเลข _ และ -');
    const row = await insert(db, 'sites', {
      id: id(),
      organization_id: actor.organization_id,
      code,
      name,
      timezone,
      demo: actor.demo,
    });
    await db.query("INSERT INTO grants(user_id,site_id,role) VALUES($1,$2,'SA')", [actor.id, row.id]);
    await event(db, actor, row.id, 'site', row.id, 'SITE_CREATED', null, row, input.reason);
    return row;
  }
  if (action !== 'site.update') fail('คำสั่ง Site ไม่ถูกต้อง');
  await db.query('UPDATE sites SET name=$1,timezone=$2 WHERE id=$3', [name, timezone, current.id]);
  const row = await one(db, 'SELECT * FROM sites WHERE id=$1', [site]);
  await event(db, actor, site, 'site', site, 'SITE_UPDATED', current, row, input.reason);
  return row;
}
