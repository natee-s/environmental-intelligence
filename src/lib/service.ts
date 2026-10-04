import type { DB } from './db';
import {
  type Actor,
  demoViewerId,
  type Row,
  actorById,
  authorize,
  can,
  one,
  insert,
  id,
  hash,
  event,
  fail,
  required,
  conflict,
  separate,
  roles,
  localDate,
  dateRange,
} from './core';
import { masterCommand } from './masters';
import { recordCommand } from './records';
import { issueCommand, evidenceCommand } from './issues';
import { importCommand } from './imports';
import { analytics, evaluateRules } from './analytics';
import { scanOperationalAlerts } from './operational-alerts';
import { siteCommand } from './sites';
import { enqueueImport } from './jobs';

async function reportCommand(db: DB, a: Actor, site: string, action: string, input: Row) {
  authorize(a, site, 'report');
  if (action === 'report.create') {
    required(input.title, 'ชื่อรายงาน');
    const snapshot = await analytics(db, site, input.from, input.to);
    const row = await insert(db, 'reports', {
      id: id(),
      site_id: site,
      title: input.title,
      period_start: input.from,
      period_end: input.to,
      created_by: a.id,
      snapshot: JSON.stringify({ ...snapshot, formulaVersion: 'P1.1', hash: hash(snapshot) }),
    });
    await event(db, a, site, 'report', row.id, action, null, { id: row.id, hash: row.snapshot.hash });
    return row;
  }
  const row = await one(db, 'SELECT * FROM reports WHERE id=$1 AND site_id=$2 FOR UPDATE', [input.id, site]);
  conflict(row, input.version);
  let next = '';
  if (action === 'report.submit') {
    if (!['DRAFT', 'REJECTED'].includes(row.status) || row.created_by !== a.id)
      fail('ส่งตรวจได้เฉพาะรายงานร่างของตน');
    next = 'IN_REVIEW';
  } else if (action === 'report.approve') {
    authorize(a, site, 'review');
    if (row.status !== 'IN_REVIEW') fail('รายงานต้องอยู่ระหว่างตรวจ');
    separate(a, row.created_by);
    next = 'APPROVED';
    await db.query('UPDATE reports SET approved_by=$1 WHERE id=$2', [a.id, row.id]);
  } else if (action === 'report.reject') {
    authorize(a, site, 'review');
    if (row.status !== 'IN_REVIEW') fail('รายงานต้องอยู่ระหว่างตรวจ');
    separate(a, row.created_by);
    required(input.reason, 'เหตุผล');
    next = 'REJECTED';
  } else if (action === 'report.publish') {
    authorize(a, site, 'review');
    if (row.status !== 'APPROVED') fail('ต้องอนุมัติรายงานก่อนเผยแพร่');
    next = 'PUBLISHED';
  } else fail('คำสั่งรายงานไม่ถูกต้อง');
  await db.query('UPDATE reports SET status=$1,version=version+1 WHERE id=$2', [next, row.id]);
  await event(
    db,
    a,
    site,
    'report',
    row.id,
    action,
    { status: row.status },
    { status: next },
    input.reason || '',
  );
  return one(db, 'SELECT * FROM reports WHERE id=$1', [row.id]);
}
async function userCommand(db: DB, a: Actor, site: string, input: Row) {
  authorize(a, site, 'users');
  const allowed = ['EO', 'DO', 'ES', 'MG', 'SA', 'AV'];
  if (!Array.isArray(input.roles) || input.roles.some((r: string) => !allowed.includes(r)))
    fail('บทบาทไม่ถูกต้อง');
  required(input.reason, 'เหตุผลเปลี่ยนสิทธิ์');
  let user: Row;
  if (input.id) {
    user = await one(db, 'SELECT u.* FROM users u WHERE u.id=$1 AND u.organization_id=$2 FOR UPDATE OF u', [
      input.id,
      a.organization_id,
    ]);
    if (user.id === a.id) fail('ไม่เปลี่ยนสิทธิ์บัญชีตนเองผ่านหน้าจอนี้');
  } else {
    const email = required(input.email, 'อีเมล').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('อีเมลไม่ถูกต้อง');
    const found = (await db.query<Row>('SELECT * FROM users WHERE email=$1', [email])).rows[0];
    if (found && found.organization_id !== a.organization_id) fail('ไม่สามารถเพิ่มบัญชีนี้ในองค์กร', 409);
    if (found?.id === a.id) fail('ไม่เปลี่ยนสิทธิ์บัญชีตนเองผ่านหน้าจอนี้');
    user =
      found ||
      (await insert(db, 'users', {
        id: id(),
        organization_id: a.organization_id,
        email,
        name: required(input.name, 'ชื่อ'),
        demo: false,
      }));
  }
  const work = await db.query(
    "SELECT id FROM issues WHERE site_id=$1 AND owner_id=$2 AND status NOT IN('CLOSED','CANCELLED')",
    [site, user.id],
  );
  if (!input.roles.some((r: string) => ['EO', 'DO', 'ES'].includes(r)) && work.rows.length)
    fail('มีงานค้าง ต้องโอนผู้รับผิดชอบก่อนถอนสิทธิ์');
  await db.query('DELETE FROM grants WHERE user_id=$1 AND site_id=$2', [user.id, site]);
  for (const role of new Set(input.roles))
    await db.query('INSERT INTO grants(user_id,site_id,role) VALUES($1,$2,$3)', [user.id, site, role]);
  await db.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
  await event(db, a, site, 'user', user.id, 'GRANTS_CHANGED', null, { roles: input.roles }, input.reason);
  return { id: user.id };
}
export async function execute(db: DB, userId: string, action: string, site: string, input: Row, key: string) {
  if (userId === demoViewerId) fail('Demo ออนไลน์เปิดให้อ่านอย่างเดียว', 403);
  if (!key || key.length > 120) fail('ต้องมี idempotency key');
  return db.transaction(async (tx) => {
    await one(tx, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const actor = await actorById(tx, userId);
    if (!roles(actor, site).length) fail('ไม่มีสิทธิ์ในพื้นที่นี้', 403);
    const requiredPermission = action.startsWith('master.')
      ? 'config'
      : action.startsWith('user.') || action.startsWith('site.')
        ? 'users'
        : action.startsWith('import.')
          ? 'entry'
          : action.startsWith('record.')
            ? ['record.approve', 'record.reject', 'record.void'].includes(action)
              ? 'review'
              : 'entry'
            : action.startsWith('report.')
              ? 'report'
              : action.startsWith('evidence.') || action.startsWith('task.')
                ? 'work'
                : 'read';
    authorize(actor, site, requiredPermission);
    const requestHash = hash({ action, site, input });
    const saved = (
      await tx.query<Row>('SELECT * FROM idempotency WHERE user_id=$1 AND request_key=$2', [userId, key])
    ).rows[0];
    if (saved) {
      if (saved.request_hash !== requestHash) fail('ใช้ request key เดิมกับข้อมูลคนละชุด', 409);
      return saved.response;
    }
    let result: Row;
    if (action.startsWith('master.')) result = await masterCommand(tx, actor, site, action, input);
    else if (action.startsWith('record.')) {
      result = await recordCommand(tx, actor, site, action, input);
      if (action === 'record.approve') await evaluateRules(tx, actor, site, result.id);
    } else if (action.startsWith('issue.') || action.startsWith('task.'))
      result = await issueCommand(tx, actor, site, action, input);
    else if (action === 'evidence.upload') result = await evidenceCommand(tx, actor, site, input);
    else if (['import.enqueue', 'import.queue-confirm', 'import.retry'].includes(action))
      result = await enqueueImport(tx, actor, site, action, input);
    else if (action.startsWith('import.')) result = await importCommand(tx, actor, site, action, input);
    else if (action.startsWith('report.')) result = await reportCommand(tx, actor, site, action, input);
    else if (action === 'user.save') result = await userCommand(tx, actor, site, input);
    else if (action.startsWith('site.')) result = await siteCommand(tx, actor, site, action, input);
    else if (action === 'notification.read') {
      authorize(actor, site, 'read');
      await tx.query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2 AND site_id=$3', [
        input.id,
        actor.id,
        site,
      ]);
      result = { ok: true };
    } else if (action === 'alert.evaluate') {
      authorize(actor, site, 'review');
      await evaluateRules(tx, actor, site, input.record_id);
      result = { ok: true };
    } else if (action === 'alert.scan') {
      authorize(actor, site, 'review');
      result = await scanOperationalAlerts(tx, actor, site);
    } else if (action.startsWith('alert.')) {
      authorize(actor, site, action === 'alert.acknowledge' ? 'issue' : 'review');
      const r = await one(tx, 'SELECT * FROM alerts WHERE id=$1 AND site_id=$2 FOR UPDATE', [input.id, site]);
      const status =
        action === 'alert.acknowledge'
          ? 'ACKNOWLEDGED'
          : action === 'alert.dismiss'
            ? 'DISMISSED'
            : action === 'alert.resolve'
              ? 'RESOLVED'
              : fail('คำสั่ง Alert ไม่ถูกต้อง');
      if (status === 'ACKNOWLEDGED' && r.status !== 'NEW') fail('รับทราบได้เฉพาะ Alert ใหม่');
      if (status !== 'ACKNOWLEDGED') required(input.reason, 'เหตุผล');
      await tx.query('UPDATE alerts SET status=$1 WHERE id=$2', [status, r.id]);
      await event(tx, actor, site, 'alert', r.id, action, r, { status }, input.reason || '');
      result = { id: r.id, status };
    } else fail('ไม่พบคำสั่ง', 404);
    await insert(tx, 'idempotency', {
      user_id: userId,
      request_key: key,
      request_hash: requestHash,
      response: JSON.stringify(result),
    });
    return result;
  });
}
export async function bootstrap(
  db: DB,
  a: Actor,
  site?: string,
  from?: string,
  to?: string,
  period?: string,
) {
  const sites = (
    await db.query<Row>(
      'SELECT DISTINCT s.* FROM sites s JOIN grants g ON g.site_id=s.id WHERE g.user_id=$1 ORDER BY s.code',
      [a.id],
    )
  ).rows.filter((s) => a.grants.some((g) => g.site_id === s.id));
  const selected = site || sites[0]?.id;
  if (!selected) fail('บัญชีนี้ยังไม่มี Site ที่ได้รับอนุญาต', 403);
  if (!sites.some((s) => s.id === selected)) fail('ไม่มีสิทธิ์ในพื้นที่นี้', 403);
  const today = localDate(sites.find((s) => s.id === selected)!.timezone);
  if (period === 'last-month' && !from && !to) {
    to = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 0))
      .toISOString()
      .slice(0, 10);
    from = to.slice(0, 7) + '-01';
  }
  from = from || today.slice(0, 7) + '-01';
  to = to || today;
  dateRange(from, to);
  const readable = can(a, selected, 'read');
  const config = can(a, selected, 'config');
  const result: Row = {
    actor: a,
    sites,
    site: selected,
    from,
    to,
    permissions: Object.keys((await import('./core')).permissions).filter((p) => can(a, selected, p)),
    local: process.env.LOCAL_DEVELOPMENT === 'true',
    authMode: process.env.AUTH_MODE || 'local',
    storage: process.env.EVIDENCE_PROVIDER || 'local',
    organization: await one(db, 'SELECT id,name FROM organizations WHERE id=$1', [a.organization_id]),
  };
  const query = async (sql: string, p: unknown[] = [selected]) => (await db.query<Row>(sql, p)).rows;
  result.masters = await query(
    'SELECT * FROM master_versions WHERE site_id=$1 ORDER BY kind,code,version DESC',
  );
  if (readable) {
    result.records = await query(
      'SELECT * FROM record_versions WHERE site_id=$1 ORDER BY event_date DESC,created_at DESC LIMIT 500',
    );
    result.issues = await query('SELECT * FROM issues WHERE site_id=$1 ORDER BY created_at DESC LIMIT 500');
    result.tasks = await query('SELECT * FROM tasks WHERE site_id=$1 ORDER BY due_date LIMIT 500');
    result.alerts = await query('SELECT * FROM alerts WHERE site_id=$1 ORDER BY created_at DESC LIMIT 500');
    result.evidence = await query(
      'SELECT id,site_id,issue_id,record_id,document_id,version,filename,mime,size,sha256,scan_status,available,uploaded_by,created_at FROM evidence WHERE site_id=$1 ORDER BY created_at DESC LIMIT 500',
    );
    result.reports = await query('SELECT * FROM reports WHERE site_id=$1 ORDER BY created_at DESC LIMIT 100');
    result.notifications = await query(
      'SELECT * FROM notifications WHERE site_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100',
      [selected, a.id],
    );
    result.imports = can(a, selected, 'entry')
      ? await query(
          'SELECT id,site_id,created_by,checksum,filename,status,created_at,jsonb_array_length(rows) AS row_count FROM import_batches WHERE site_id=$1 ORDER BY created_at DESC LIMIT 30',
        )
      : [];
    result.jobs = can(a, selected, 'entry')
      ? await query(
          'SELECT id,batch_id,kind,status,cursor,total,error,created_at FROM background_jobs WHERE site_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 30',
          [selected, a.id],
        )
      : [];
    result.analytics = await analytics(db, selected, from, to);
    result.events = await query(
      "SELECT * FROM events WHERE site_id=$1 AND entity_type NOT IN('user','auth') ORDER BY created_at DESC LIMIT 500",
    );
  }
  if (can(a, selected, 'audit')) {
    result.audit = await query(
      'SELECT * FROM events WHERE site_id=$1' +
        (readable ? '' : " AND entity_type IN('master','user','auth','site')") +
        ' ORDER BY created_at DESC LIMIT 300',
    );
  }
  result.users =
    readable || config
      ? await query(
          'SELECT u.id,u.name,u.email,u.active,u.demo,array_agg(g.role) AS roles FROM users u JOIN grants g ON g.user_id=u.id WHERE g.site_id=$1 GROUP BY u.id ORDER BY u.name',
        )
      : [];
  return result;
}
