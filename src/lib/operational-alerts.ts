import type { DB } from './db';
import {
  type Actor,
  type Row,
  one,
  localDate,
  dateString,
  event,
  notify,
  supervisors,
  id,
  insert,
} from './core';
import { coverage } from './analytics';
export async function scanOperationalAlerts(db: DB, actor: Actor, site: string, now = new Date()) {
  const s = await one(db, 'SELECT * FROM sites WHERE id=$1', [site]);
  const today = localDate(s.timezone, now);
  const from = new Date(Date.parse(today) - 7 * 86400000).toISOString().slice(0, 10);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: s.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const records = (
    await db.query<Row>(
      'SELECT * FROM record_versions WHERE site_id=$1 AND event_date BETWEEN $2::date AND $3::date',
      [site, from, today],
    )
  ).rows;
  const health = await coverage(db, site, from, today, records);
  const expected = new Set<string>();
  let created = 0,
    resolved = 0;
  const add = async (
    key: string,
    type: string,
    summary: string,
    snapshot: Row,
    recipients: string[],
    href: string,
  ) => {
    expected.add(key);
    if ((await db.query('SELECT 1 FROM alerts WHERE episode_key=$1', [key])).rows.length) return;
    const alert = await insert(db, 'alerts', {
      id: id(),
      site_id: site,
      alert_type: type,
      severity: 'MEDIUM',
      summary,
      snapshot: JSON.stringify({
        rule: { config: { reference: 'ตารางและเวลาปฏิบัติงานที่ยืนยันแล้ว' } },
        ...snapshot,
      }),
      episode_key: key,
    });
    const e = await event(db, actor, site, 'alert', alert.id, type, null, { summary, snapshot });
    await notify(db, site, e.id, recipients, summary, href);
    created++;
  };
  for (const slot of health.missing) {
    if (slot.date === today && time <= slot.due) continue;
    await add(
      `${site}|MISSING|${slot.schedule}|${slot.date}`,
      'MISSING_DATA',
      `ข้อมูลขาด: ${slot.asset} / ${slot.date}`,
      { slot },
      await supervisors(db, site),
      '/data/quality',
    );
  }
  const issues = (
    await db.query<Row>(
      "SELECT * FROM issues WHERE site_id=$1 AND status NOT IN('CLOSED','CANCELLED') AND due_date<$2::date",
      [site, today],
    )
  ).rows;
  for (const issue of issues)
    await add(
      `${site}|OVERDUE|${issue.id}|${dateString(issue.due_date)}`,
      'OVERDUE_ISSUE',
      `งานเกินกำหนด: ${issue.number}`,
      { issue_id: issue.id, due_date: dateString(issue.due_date) },
      [issue.owner_id, issue.verifier_id].filter(Boolean),
      `/issues/${issue.id}`,
    );
  const existing = (
    await db.query<Row>(
      "SELECT * FROM alerts WHERE site_id=$1 AND alert_type<>'THRESHOLD' AND episode_open=true",
      [site],
    )
  ).rows;
  for (const alert of existing) {
    if (expected.has(alert.episode_key)) continue;
    if (alert.alert_type === 'MISSING_DATA' && alert.snapshot.slot.date < from) continue;
    await db.query(
      "UPDATE alerts SET episode_open=false,status=CASE WHEN status='LINKED' THEN status ELSE 'RESOLVED' END WHERE id=$1",
      [alert.id],
    );
    await event(
      db,
      actor,
      site,
      'alert',
      alert.id,
      'CONDITION_RESOLVED',
      null,
      null,
      'เงื่อนไขข้อมูลขาด/เกินกำหนดเปลี่ยนแล้ว ไม่ปิด Issue อัตโนมัติ',
    );
    resolved++;
  }
  return { created, resolved, checkedAt: now.toISOString(), from, to: today };
}
