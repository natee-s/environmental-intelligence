import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDatabase, migrate, type DB } from '../src/lib/db';
import { seed } from '../src/lib/seed';
import { execute, bootstrap } from '../src/lib/service';
import { actorById, one, id, localDate, dateString, type Row } from '../src/lib/core';
import { analytics, normalized, evaluateValue } from '../src/lib/analytics';
import { validateFile } from '../src/lib/storage';
import { scanOperationalAlerts } from '../src/lib/operational-alerts';
import { writeWorkbook } from '../src/lib/workbooks';
import { processNextJob } from '../src/lib/jobs';
import { scanScheduledSites } from '../src/lib/worker';
import { listRecords } from '../src/lib/lists';
import { reportPdf } from '../src/lib/pdf-report';
let db: DB, dir: string;
const site = 'site-a';
const run = (user: string, action: string, input: Row, key = id(), scope = site) =>
  execute(db, user, action, scope, input, key);
const today = () => localDate();
const day = (offset: number) => new Date(Date.parse(today()) - offset * 86400000).toISOString().slice(0, 10);
const data = (date: string, value = 200, extra: Row = {}) => ({
  category: 'WATER',
  asset_code: 'W-MAIN',
  parameter_code: 'WATER_USE',
  event_date: date,
  value,
  unit: 'm3',
  kind: 'CONSUMED',
  source: 'MANUAL',
  ...extra,
});
async function approve(r: Row, creator = 'eo', reviewer = 'es1') {
  const s = await run(creator, 'record.submit', { id: r.id, version: r.lock_version });
  return run(reviewer, 'record.approve', { id: r.id, version: s.lock_version });
}
before(async () => {
  process.env.LOCAL_DEVELOPMENT = 'true';
  process.env.EVIDENCE_PROVIDER = 'local';
  dir = await mkdtemp(path.join(os.tmpdir(), 'env-p1-test-'));
  process.env.EVIDENCE_DIR = dir;
  if (process.env.TEST_DATABASE_URL) {
    process.env.DB_DRIVER = 'postgres';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
  db = await createDatabase(!process.env.TEST_DATABASE_URL);
  await migrate(db);
  await seed(db, { monthly: false });
});
after(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});
test('migrations and seed are idempotent', async () => {
  const count = await one(db, 'SELECT count(*) AS n FROM record_versions');
  await migrate(db);
  await seed(db, { monthly: false });
  assert.equal((await one(db, 'SELECT count(*) AS n FROM record_versions')).n, count.n);
});
test('internal efficiency targets require independent approval, reject ambiguous overlaps and do not bypass Site scope', async () => {
  const config = {
    category: 'ENERGY',
    resource_unit: 'kWh',
    production_unit: 't',
    limit: 150,
    reference: 'Test internal target',
  };
  const target = await run('es1', 'master.save', {
    kind: 'INTENSITY_TARGET',
    code: 'TEST_INTENSITY',
    name: 'Test target',
    effective_from: day(2),
    config,
  });
  await run('es1', 'master.submit', { id: target.id });
  await assert.rejects(() => run('es1', 'master.approve', { id: target.id }), /ตนเอง/);
  await run('es2', 'master.approve', { id: target.id });
  const a = await analytics(db, site, day(2), day(1));
  assert.equal(a.comparison.find((p) => p.id === 'energy-production')!.periodTarget!.id, target.id);
  const alt = await run('admin', 'master.save', {
    kind: 'INTENSITY_TARGET',
    code: 'TEST_ALTERNATIVE',
    name: 'Overlap',
    effective_from: day(1),
    config,
  });
  await run('admin', 'master.submit', { id: alt.id });
  await assert.rejects(() => run('es2', 'master.approve', { id: alt.id }), /ซ้อนกัน/);
  await assert.rejects(() => run('es2', 'master.approve', { id: alt.id }, id(), 'site-b'), /สิทธิ์/);
});
test('IEAT samples are approved Demo facts, distinct from discharge and never activate reference rules', async () => {
  assert.match((await actorById(db, 'eo')).name, /^นาย A/);
  const rules = (
    await db.query<Row>("SELECT * FROM master_versions WHERE site_id=$1 AND code LIKE 'IEAT76_%'", [site])
  ).rows;
  assert.equal(rules.length, 8);
  assert.ok(rules.every((r) => r.status === 'DRAFT' && !r.approved_by && r.config.regulatory));
  const a = await analytics(db, site, day(7), day(1));
  assert.equal(a.ieatPlots.length, 8);
  assert.ok(a.ieatPlots.every((p) => p.samples.length === 7));
  const cod = a.ieatPlots.find((p) => p.code === 'COD')!;
  assert.equal(cod.upper, 750);
  assert.ok(cod.samples.every((s: Row) => s.context === 'IEAT_CENTRAL' && s.asset === 'LAB-IEAT'));
  const alerts = (
    await db.query<Row>('SELECT * FROM alerts WHERE rule_id=ANY($1::text[])', [rules.map((r) => r.id)])
  ).rows;
  assert.equal(alerts.length, 0);
  const waterPair = a.comparison.find((p) => p.id === 'water-wastewater')!;
  assert.equal(waterPair.matched, 7);
  assert.ok(waterPair.rows.every((r: Row) => r.complete));
  await assert.rejects(
    () =>
      run('eo', 'record.create', {
        category: 'WASTEWATER',
        asset_code: 'LAB-IEAT',
        parameter_code: 'PH',
        event_date: day(10),
        value: 15,
        unit: 'pH',
        kind: 'LAB',
        source_ref: 'PH-INVALID',
        source: 'LAB',
      }),
    /pH/,
  );
  await assert.rejects(
    () =>
      run('eo', 'record.create', {
        category: 'WASTEWATER',
        asset_code: 'LAB-IEAT',
        parameter_code: 'WW_TREATED',
        event_date: day(10),
        value: 100,
        unit: 'm3',
        kind: 'TREATED',
        source: 'MANUAL',
      }),
    /เฉพาะผลตรวจ LAB/,
  );
});
test('approved facts only; pending revision leaves original; approval supersedes without double count', async () => {
  const date = day(20);
  let r = await run('eo', 'record.create', data(date));
  let a = await analytics(db, site, date, date);
  assert.equal(a.kpis[0].value, null);
  r = await approve(r);
  assert.equal((await analytics(db, site, date, date)).kpis[0].value, 200);
  const report = await run('eo', 'report.create', { title: 'Original snapshot', from: date, to: date });
  let revision = await run('eo', 'record.revise', {
    id: r.id,
    version: r.lock_version,
    reason: 'แก้ค่าที่อ่านผิด',
    data: { value: 220 },
  });
  assert.equal((await analytics(db, site, date, date)).kpis[0].value, 200);
  revision = await approve(revision);
  a = await analytics(db, site, date, date);
  assert.equal(a.kpis[0].value, 220);
  assert.deepEqual(a.kpis[0].sources, [revision.id]);
  assert.equal(
    (await one(db, 'SELECT status FROM record_versions WHERE id=$1', [r.id])).status,
    'SUPERSEDED',
  );
  assert.equal(
    (await one(db, 'SELECT snapshot FROM reports WHERE id=$1', [report.id])).snapshot.kpis[0].value,
    200,
  );
});
test('maker-checker rejects supervisor approval of own records, rules and reports', async () => {
  const r = await run('es1', 'record.create', data(day(21)));
  const s = await run('es1', 'record.submit', { id: r.id, version: r.lock_version });
  await assert.rejects(() => run('es1', 'record.approve', { id: s.id, version: s.lock_version }), /ตนเอง/);
  await run('es2', 'record.approve', { id: s.id, version: s.lock_version });
  const m = await run('es1', 'master.save', {
    kind: 'RULE',
    code: 'TEST_RULE',
    name: 'Test rule',
    effective_from: day(22),
    config: {
      parameter: 'WATER_USE',
      unit: 'm3',
      operator: '>',
      threshold: 500,
      severity: 'HIGH',
      reference: 'test',
    },
  });
  await run('es1', 'master.submit', { id: m.id });
  await assert.rejects(() => run('es1', 'master.approve', { id: m.id }), /ตนเอง/);
  const r1 = await run('es1', 'report.create', { title: 'Maker checker', from: day(21), to: day(21) });
  const r2 = await run('es1', 'report.submit', { id: r1.id, version: r1.version });
  await assert.rejects(() => run('es1', 'report.approve', { id: r2.id, version: r2.version }), /ตนเอง/);
});
test('scope enforced for reads, commands, master and cross-site record IDs; admin has no facts', async () => {
  const actor = await actorById(db, 'eo');
  await assert.rejects(() => bootstrap(db, actor, 'site-b'), /ไม่มีสิทธิ์/);
  await assert.rejects(() => run('eo', 'record.create', data(day(22)), id(), 'site-b'), /ไม่มีสิทธิ์/);
  const admin = await bootstrap(db, await actorById(db, 'admin'), site);
  assert.equal(admin.records, undefined);
  assert.equal(admin.analytics, undefined);
  assert.ok(admin.audit.every((e: Row) => ['master', 'user', 'auth'].includes(e.entity_type)));
  await assert.rejects(() => run('manager', 'record.create', data(day(22))), /ไม่มีสิทธิ์/);
  const r = await one(db, 'SELECT id,lock_version FROM record_versions WHERE site_id=$1 LIMIT 1', [site]);
  await assert.rejects(
    () => run('eo-b', 'record.submit', { id: r.id, version: r.lock_version }, id(), 'site-b'),
    /ไม่พบรายการ/,
  );
});
test('idempotency returns one result and rejects key reused with different body', async () => {
  const key = id();
  const input = data(day(22));
  const first = await run('eo', 'record.create', input, key);
  const second = await run('eo', 'record.create', input, key);
  assert.equal(first.id, second.id);
  await assert.rejects(() => run('eo', 'record.create', { ...input, value: 44 }, key), /request key/);
  await assert.rejects(() => run('eo', 'record.create', input), /ซ้ำ/);
});
test('revision concurrency and optimistic version conflict fail safely', async () => {
  let r = await run('eo', 'record.create', data(day(23)));
  r = await approve(r);
  const results = await Promise.allSettled([
    run('eo', 'record.revise', { id: r.id, version: r.lock_version, reason: 'a', data: { value: 101 } }),
    run('es1', 'record.revise', { id: r.id, version: r.lock_version, reason: 'b', data: { value: 102 } }),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  const draft = (results.find((x) => x.status === 'fulfilled') as PromiseFulfilledResult<Row>).value;
  await assert.rejects(
    () => run(draft.created_by, 'record.edit', { id: draft.id, version: 999, data: { value: 111 } }),
    /conflict/,
  );
});
test('numeric/unit/future validation and confirmed production zero', async () => {
  await assert.rejects(() => run('eo', 'record.create', data(day(24), -1)), /value/);
  await assert.rejects(() => run('eo', 'record.create', data(day(24), 20, { unit: 'kWh' })), /หน่วย/);
  await assert.rejects(() => run('eo', 'record.create', data('2099-01-01')), /อนาคต/);
  const p = {
    category: 'PRODUCTION',
    asset_code: 'LINE-ALL',
    parameter_code: 'OUTPUT',
    event_date: day(24),
    value: 0,
    unit: 't',
    kind: 'PRODUCTION',
    source: 'MANUAL',
  };
  await assert.rejects(() => run('eo', 'record.create', p), /ศูนย์/);
  await approve(await run('eo', 'record.create', { ...p, note: 'หยุดผลิตตามแผน' }));
  await approve(await run('eo', 'record.create', data(day(24), 150)));
  const a = await analytics(db, site, day(24), day(24));
  assert.equal(a.production.value, 0);
  assert.equal(a.production.coverage.received, 1);
  assert.equal(a.kpis[0].intensity, null);
});
test('cumulative reset, missing baseline, hierarchy boundary and censored lab do not invent data', () => {
  const base = {
    id: 'r2',
    asset_code: 'c',
    parameter_code: 'p',
    kind: 'CONSUMED',
    event_date: '2026-01-02',
    value: 5,
    config_snapshot: { unit: { config: { factor: 1 } }, asset: { config: { mode: 'CUMULATIVE' } } },
  };
  assert.equal(normalized(base, []).value, null);
  const old = { ...base, id: 'r1', event_date: '2026-01-01', value: 100 };
  assert.equal(normalized(base, [old]).value, null);
  assert.equal(
    normalized(base, [old], [{ effective_from: '2026-01-02', config: { asset: 'c', consumption: 10 } }])
      .value,
    10,
  );
  assert.equal(
    evaluateValue({ status: 'APPROVED', qualifier: '<' }, { config: { operator: '>', threshold: 4 } }, null),
    'INDETERMINATE',
  );
});
test('CSV preview, explicit partial import, date mapping, duplicate prevention and retries', async () => {
  const csv = `category,asset_code,parameter_code,event_date,value,unit,kind\nWATER,W-MAIN,WATER_USE,${day(25)},123,m3,CONSUMED\nWATER,W-MAIN,WATER_USE,${day(26)},abc,m3,CONSUMED`;
  const batch = await run('eo', 'import.preview', {
    csv,
    filename: 'test.csv',
    mapping: {},
    dateFormat: 'ISO',
    calendar: 'CE',
  });
  assert.equal(batch.rows.filter((r: Row) => !r.error).length, 1);
  assert.equal(
    (await db.query('SELECT 1 FROM record_versions WHERE event_date=$1::date', [day(25)])).rows.length,
    0,
  );
  await assert.rejects(() => run('eo', 'import.confirm', { id: batch.id }), /ยืนยัน/);
  const confirmed = await run('eo', 'import.confirm', { id: batch.id, allowPartial: true });
  const again = await run('eo', 'import.confirm', { id: batch.id, allowPartial: true });
  assert.equal(confirmed.result.imported.length, 1);
  assert.equal(again.result.imported[0].id, confirmed.result.imported[0].id);
  assert.equal((await analytics(db, site, day(25), day(25))).kpis[0].value, null);
  const row = await one(db, 'SELECT * FROM record_versions WHERE id=$1', [confirmed.result.imported[0].id]);
  assert.equal(row.source, 'FILE_IMPORT');
  assert.equal(row.payload.source_row, 2);
});
test('approved DB facts and audit are immutable', async () => {
  const r = await one(db, "SELECT * FROM record_versions WHERE status='APPROVED' LIMIT 1");
  await assert.rejects(
    () => db.query('UPDATE record_versions SET value=999 WHERE id=$1', [r.id]),
    /immutable/,
  );
  await assert.rejects(() => db.query('DELETE FROM events'), /immutable/);
});
test('Alert → Issue → Assign → Action → Reject → Verify → evidence change → reverify → Close → Reopen', async () => {
  const r = await approve(await run('eo', 'record.create', data(day(27), 999)));
  await run('es1', 'alert.evaluate', { record_id: r.id });
  const count = await one(db, 'SELECT count(*) AS n FROM alerts WHERE episode_open=true');
  await run('es1', 'alert.evaluate', { record_id: r.id });
  assert.equal((await one(db, 'SELECT count(*) AS n FROM alerts WHERE episode_open=true')).n, count.n);
  const alert = await one(
    db,
    'SELECT * FROM alerts WHERE site_id=$1 AND episode_open=true ORDER BY created_at DESC LIMIT 1',
    [site],
  );
  let issue = await run('es1', 'issue.create', {
    title: 'ตรวจสอบน้ำใช้สูงในการทดสอบ',
    description: 'ตรวจตามแหล่งข้อมูล',
    category: 'WATER',
    severity: 'HIGH',
    source_record_id: r.id,
    source_reason: 'ทดสอบ',
  });
  await assert.rejects(
    () =>
      run('es1', 'issue.assign', {
        id: issue.id,
        version: issue.version,
        owner_id: 'eo-b',
        verifier_id: 'es2',
        due_date: today(),
      }),
    /ไม่มีสิทธิ์/,
  );
  issue = await run('es1', 'issue.assign', {
    id: issue.id,
    version: issue.version,
    owner_id: 'owner',
    verifier_id: 'es2',
    due_date: today(),
  });
  issue = await run('owner', 'issue.investigate', {
    id: issue.id,
    version: issue.version,
    note: 'ตรวจมิเตอร์และท่อ',
  });
  issue = await run('owner', 'issue.plan', {
    id: issue.id,
    version: issue.version,
    root_cause: 'ยังไม่ยืนยัน รอตรวจจุดเชื่อม',
    description: 'ตรวจสอบและแก้จุดเชื่อม',
  });
  await assert.rejects(
    () => run('owner', 'issue.submit', { id: issue.id, version: issue.version, note: 'เสร็จ' }),
    /Action/,
  );
  const task = await one(db, 'SELECT * FROM tasks WHERE issue_id=$1', [issue.id]);
  issue = await run('owner', 'task.done', {
    id: issue.id,
    version: issue.version,
    task_id: task.id,
    note: 'ดำเนินการแก้ไขแล้ว',
  });
  await assert.rejects(
    () => run('owner', 'issue.submit', { id: issue.id, version: issue.version, note: 'เสร็จ' }),
    /หลักฐาน/,
  );
  const file = {
    filename: 'inspection.pdf',
    mime: 'application/pdf',
    base64: Buffer.from('%PDF-1.4\nDemo evidence\n%%EOF').toString('base64'),
  };
  await run('owner', 'evidence.upload', { issue_id: issue.id, version: issue.version, ...file });
  issue = await one(db, 'SELECT * FROM issues WHERE id=$1', [issue.id]);
  issue = await run('owner', 'issue.submit', {
    id: issue.id,
    version: issue.version,
    note: 'แก้ไขแล้วและแนบหลักฐาน',
  });
  await assert.rejects(
    () => run('es1', 'issue.verify', { id: issue.id, version: issue.version, note: 'ตรวจ', checks: {} }),
    /ตนเอง/,
  );
  issue = await run('es2', 'issue.reject', {
    id: issue.id,
    version: issue.version,
    reason: 'ขอทดสอบซ้ำก่อน',
  });
  assert.equal(issue.status, 'ACTION_IN_PROGRESS');
  issue = await run('owner', 'task.done', {
    id: issue.id,
    version: issue.version,
    task_id: task.id,
    note: 'ทดสอบซ้ำแล้ว',
  });
  issue = await run('owner', 'issue.submit', { id: issue.id, version: issue.version, note: 'ส่งผลใหม่' });
  const checks = Object.fromEntries(issue.workflow_snapshot.config.checklist.map((c: string) => [c, true]));
  issue = await run('es2', 'issue.verify', {
    id: issue.id,
    version: issue.version,
    note: 'ตรวจหลักฐานแล้ว',
    checks,
  });
  assert.equal(issue.status, 'VERIFIED');
  await run('owner', 'evidence.upload', {
    issue_id: issue.id,
    version: issue.version,
    ...file,
    filename: 'follow-up.pdf',
  });
  issue = await one(db, 'SELECT * FROM issues WHERE id=$1', [issue.id]);
  assert.equal(issue.status, 'ACTION_IN_PROGRESS');
  await assert.rejects(
    () => run('es2', 'issue.close', { id: issue.id, version: issue.version, note: 'ปิด' }),
    /สถานะ/,
  );
  issue = await run('owner', 'issue.submit', {
    id: issue.id,
    version: issue.version,
    note: 'ส่งตรวจชุดหลักฐานใหม่',
  });
  issue = await run('es2', 'issue.verify', {
    id: issue.id,
    version: issue.version,
    note: 'ตรวจชุดใหม่',
    checks,
  });
  issue = await run('es2', 'issue.close', {
    id: issue.id,
    version: issue.version,
    note: 'ตรวจยืนยันครบและปิดงาน',
  });
  assert.equal(issue.status, 'CLOSED');
  const original = issue.original_due;
  issue = await run('es2', 'issue.reopen', {
    id: issue.id,
    version: issue.version,
    reason: 'พบข้อมูลทดสอบใหม่',
  });
  assert.equal(issue.status, 'REOPENED');
  assert.equal(dateString(issue.original_due), dateString(original));
  assert.ok(
    (await db.query("SELECT 1 FROM events WHERE entity_id=$1 AND action='issue.close'", [issue.id])).rows
      .length,
  );
  assert.ok(alert.id);
});
test('legal rule cannot activate without explicit confirmation', async () => {
  const m = await run('es1', 'master.save', {
    kind: 'RULE',
    code: 'LEGAL_TEST',
    name: 'เกณฑ์ทดสอบการยืนยัน',
    effective_from: today(),
    config: {
      parameter: 'COD',
      unit: 'mg_L',
      operator: '>',
      threshold: 100,
      severity: 'HIGH',
      reference: 'test reference only',
      regulatory: true,
    },
  });
  await run('es1', 'master.submit', { id: m.id });
  await assert.rejects(() => run('es2', 'master.approve', { id: m.id }), /กฎหมาย/);
  assert.equal((await one(db, 'SELECT status FROM master_versions WHERE id=$1', [m.id])).status, 'SUBMITTED');
});
test('file signatures and active PDF content are rejected', () => {
  assert.throws(() => validateFile('virus.pdf', 'application/pdf', Buffer.from('MZ executable')), /ชนิด/);
  assert.throws(
    () => validateFile('active.pdf', 'application/pdf', Buffer.from('%PDF-1.4 /JavaScript evil')),
    /active content/,
  );
});
test('missing-data alerts respect site deadlines, dedupe, and resolve without closing issues', async () => {
  const actor = await actorById(db, 'es1');
  const before = new Date(today() + 'T02:00:00Z');
  await db.transaction((tx) => scanOperationalAlerts(tx, actor, site, before));
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM alerts WHERE alert_type='MISSING_DATA' AND snapshot->'slot'->>'date'=$1",
        [today()],
      )
    ).rows.length,
    0,
  );
  const after = new Date(Date.parse(today() + 'T17:01:00Z'));
  await db.transaction((tx) => scanOperationalAlerts(tx, actor, site, after));
  const count = (await one(db, "SELECT count(*) AS n FROM alerts WHERE alert_type='MISSING_DATA'")).n;
  await db.transaction((tx) => scanOperationalAlerts(tx, actor, site, after));
  assert.equal((await one(db, "SELECT count(*) AS n FROM alerts WHERE alert_type='MISSING_DATA'")).n, count);
  const alert = await one(
    db,
    "SELECT * FROM alerts WHERE alert_type='MISSING_DATA' AND snapshot->'slot'->>'asset'='E-MAIN' AND snapshot->'slot'->>'date'=$1",
    [today()],
  );
  const issue = await run('eo', 'issue.create', {
    title: 'ติดตามข้อมูลพลังงานที่ยังขาด',
    description: 'ทดสอบข้อมูลมาภายหลัง',
    category: 'DATA_QUALITY',
    severity: 'MEDIUM',
    alert_id: alert.id,
  });
  await run('eo', 'record.create', {
    category: 'ENERGY',
    asset_code: 'E-MAIN',
    parameter_code: 'ELECTRICITY',
    event_date: today(),
    value: 0,
    unit: 'kWh',
    kind: 'CONSUMED',
    source: 'MANUAL',
  });
  await db.transaction((tx) => scanOperationalAlerts(tx, actor, site, after));
  assert.equal(
    (await one(db, 'SELECT episode_open FROM alerts WHERE id=$1', [alert.id])).episode_open,
    false,
  );
  assert.equal((await one(db, 'SELECT status FROM issues WHERE id=$1', [issue.id])).status, 'OPEN');
});
test('master effective versions, exemption denominator and immutable approved config', async () => {
  const date = day(28);
  const before = await analytics(db, site, date, date);
  assert.equal(before.kpis[0].coverage.expected, 1);
  const m = await run('es1', 'master.save', {
    kind: 'EXEMPTION',
    code: 'TEST_EXEMPTION',
    name: 'หยุดมิเตอร์ทดสอบหนึ่งวัน',
    effective_from: date,
    effective_to: date,
    config: { schedule: 'WATER_USE_DAILY', reason: 'ซ่อมมิเตอร์' },
  });
  await run('es1', 'master.submit', { id: m.id });
  await run('es2', 'master.approve', { id: m.id });
  assert.equal((await analytics(db, site, date, date)).kpis[0].coverage.expected, 0);
  assert.equal((await analytics(db, site, day(29), day(29))).kpis[0].coverage.expected, 1);
  await assert.rejects(
    () => db.query("UPDATE master_versions SET config='{}' WHERE id=$1", [m.id]),
    /immutable/,
  );
  const current = await one(
    db,
    "SELECT * FROM master_versions WHERE kind='UNIT' AND code='m3' AND site_id=$1 AND status='ACTIVE'",
    [site],
  );
  const revision = await run('es1', 'master.save', {
    kind: 'UNIT',
    code: 'm3',
    name: 'ลูกบาศก์เมตร รุ่นใหม่',
    effective_from: today(),
    config: current.config,
  });
  await run('es1', 'master.submit', { id: revision.id });
  await run('es2', 'master.approve', { id: revision.id });
  assert.equal(
    dateString(
      (await one(db, 'SELECT effective_to FROM master_versions WHERE id=$1', [current.id])).effective_to,
    ),
    day(1),
  );
});
test('XLSX import previews and commits only validated drafts', async () => {
  const buffer = await writeWorkbook([data(day(30), 456)]);
  const workbook = buffer.toString('base64');
  const inspected = await run('eo', 'import.inspect', { workbook });
  assert.deepEqual(inspected.sheets, ['Snapshot']);
  const preview = await run('eo', 'import.preview', {
    workbook,
    sheet: 'Snapshot',
    filename: 'readings.xlsx',
    dateFormat: 'ISO',
    calendar: 'CE',
    mapping: {},
  });
  assert.equal(preview.rows[0].error, '');
  const saved = await run('eo', 'import.confirm', { id: preview.id });
  assert.equal(saved.result.imported.length, 1);
  assert.equal((await analytics(db, site, day(30), day(30))).kpis[0].value, null);
});
test('revocation applies to next command, including idempotent retries', async () => {
  const key = id(),
    input = data(day(31));
  await run('eo', 'record.create', input, key);
  await db.query("DELETE FROM grants WHERE user_id='eo' AND site_id='site-a'");
  await db.query("INSERT INTO grants(user_id,site_id,role) VALUES('eo','site-a','SA')");
  await assert.rejects(() => run('eo', 'record.create', input, key), /ไม่มีสิทธิ์/);
  await db.query("DELETE FROM grants WHERE user_id='eo' AND site_id='site-a'");
  await db.query("INSERT INTO grants(user_id,site_id,role) VALUES('eo','site-a','EO')");
});
test('reports complete review/publish flow while stored snapshot remains immutable', async () => {
  let report = await run('eo', 'report.create', { title: 'รายงานตรวจรับ', from: day(2), to: day(1) });
  const original = JSON.stringify(report.snapshot);
  report = await run('eo', 'report.submit', { id: report.id, version: report.version });
  report = await run('es2', 'report.approve', { id: report.id, version: report.version });
  report = await run('es2', 'report.publish', { id: report.id, version: report.version });
  assert.equal(report.status, 'PUBLISHED');
  assert.equal(JSON.stringify(report.snapshot), original);
  await assert.rejects(
    () => db.query("UPDATE reports SET snapshot='{}' WHERE id=$1", [report.id]),
    /immutable/,
  );
});

test('blank remains missing; draft unit edits update snapshot and compatible thresholds convert units', async () => {
  let r = await run('eo', 'record.create', data(day(70), 0, { value: '' }));
  assert.equal(r.value, null);
  await assert.rejects(() => run('eo', 'record.submit', { id: r.id, version: r.lock_version }), /ค่า/);
  r = await run('eo', 'record.edit', {
    id: r.id,
    version: r.lock_version,
    data: { value: 200000, unit: 'L' },
  });
  assert.equal(r.unit, 'L');
  assert.equal(r.config_snapshot.unit.code, 'L');
  // End an existing episode with an independently approved normal value.
  await approve(await run('eo', 'record.create', data(day(71), 100)));
  r = await approve(r);
  assert.equal((await analytics(db, site, day(70), day(70))).kpis[0].value, 200);
  const alert = await one(db, 'SELECT * FROM alerts WHERE record_id=$1', [r.id]);
  assert.match(alert.summary, /200 m3/);
  await db.query('UPDATE alerts SET episode_open=false WHERE id=$1', [alert.id]);
  await run('es1', 'alert.evaluate', { record_id: r.id });
  assert.equal((await db.query('SELECT id FROM alerts WHERE record_id=$1', [r.id])).rows.length, 1);
});

test('draft master effective dates persist and same-day retirement preserves references', async () => {
  let m = await run('admin', 'master.save', {
    kind: 'DEPARTMENT',
    code: 'DATE_TEST',
    name: 'วันที่ทดสอบ',
    effective_from: day(2),
    config: {},
  });
  m = await run('admin', 'master.edit', {
    id: m.id,
    name: m.name,
    effective_from: today(),
    effective_to: today(),
    config: {},
  });
  assert.equal(dateString(m.effective_from), today());
  assert.equal(dateString(m.effective_to), today());
  await run('admin', 'master.submit', { id: m.id });
  await run('es1', 'master.approve', { id: m.id });
  m = await run('es1', 'master.deactivate', { id: m.id, reason: 'สิ้นสุดวันนี้' });
  assert.equal(dateString(m.effective_to), today());
  assert.equal(m.status, 'INACTIVE');
});

test('durable import resumes chunks, detects duplicates across chunks and stops after permission revocation', async () => {
  const lines = Array.from(
    { length: 130 },
    (_, i) => `WATER,W-MAIN,WATER_USE,${day(300 + i)},10,m3,CONSUMED`,
  );
  lines.push(lines[0]);
  const csv = 'category,asset_code,parameter_code,event_date,value,unit,kind\n' + lines.join('\n');
  const input = { csv, dateFormat: 'ISO', calendar: 'CE', filename: 'Demo-large.csv' };
  const queued = await run('eo', 'import.enqueue', input);
  assert.equal((await run('eo', 'import.enqueue', input)).batch_id, queued.batch_id);
  await assert.rejects(
    () => run('eo-b', 'import.queue-confirm', { id: queued.batch_id }, id(), 'site-b'),
    /ไม่พบ/,
  );
  await processNextJob(db);
  assert.equal(
    (await one(db, 'SELECT cursor FROM background_jobs WHERE id=$1', [queued.job_id])).cursor,
    100,
  );
  await processNextJob(db);
  const batch = await one(db, 'SELECT * FROM import_batches WHERE id=$1', [queued.batch_id]);
  assert.equal(batch.status, 'PREVIEW');
  assert.match(batch.rows[130].error, /ซ้ำ/);
  await assert.rejects(() => run('eo', 'import.queue-confirm', { id: batch.id }), /partial/);
  const confirm = await run('eo', 'import.queue-confirm', { id: batch.id, allowPartial: true });
  await processNextJob(db);
  let job = await one(db, 'SELECT * FROM background_jobs WHERE id=$1', [confirm.job_id]);
  assert.equal(job.cursor, 50);
  await db.query("DELETE FROM grants WHERE user_id='eo' AND site_id='site-a'");
  await processNextJob(db);
  job = await one(db, 'SELECT * FROM background_jobs WHERE id=$1', [confirm.job_id]);
  assert.equal(job.status, 'FAILED');
  assert.equal(job.cursor, 50);
  await db.query("INSERT INTO grants(user_id,site_id,role) VALUES('eo','site-a','EO')");
  await run('eo', 'import.retry', { id: job.id });
  await processNextJob(db);
  await processNextJob(db);
  const completed = await one(db, 'SELECT * FROM import_batches WHERE id=$1', [batch.id]);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.result.imported.length, 130);
  assert.equal(new Set(completed.result.imported.map((r: Row) => r.id)).size, 130);
  assert.equal(await processNextJob(db), false);
});

test('scheduler runs without a browser and deduplicates scan cycles', async () => {
  const now = new Date();
  await scanScheduledSites(db, 'es2', now);
  const before = await one(db, 'SELECT * FROM scheduler_state WHERE site_id=$1', [site]);
  await scanScheduledSites(db, 'es2', new Date(now.getTime() + 1000));
  const after = await one(db, 'SELECT * FROM scheduler_state WHERE site_id=$1', [site]);
  assert.equal(String(after.last_scan), String(before.last_scan));
  assert.equal((await db.query("SELECT 1 FROM scheduler_state WHERE site_id='site-b'")).rows.length, 0);
});

test('Site administration is scoped and shared organization users can receive new Site grants', async () => {
  await assert.rejects(
    () =>
      run('eo', 'site.create', { name: 'Denied', code: 'DENIED', timezone: 'Asia/Bangkok', reason: 'test' }),
    /ไม่มีสิทธิ์/,
  );
  const s = await run('admin', 'site.create', {
    name: 'Demo test new Site',
    code: 'TEST_NEW',
    timezone: 'Asia/Bangkok',
    reason: 'fixture',
  });
  assert.equal(s.demo, true);
  await run(
    'admin',
    'user.save',
    { email: 'es1@demo.local', name: 'es1', roles: ['ES'], reason: 'grant new Site' },
    id(),
    s.id,
  );
  assert.ok((await actorById(db, 'es1')).grants.some((g) => g.site_id === s.id && g.role === 'ES'));
  await assert.rejects(
    () => run('admin', 'site.update', { name: 'wrong', timezone: 'invalid-zone', reason: 'test' }),
    /เขตเวลา/,
  );
});

test('database paging and search cover all records and enforce Site scope', async () => {
  const actor = await actorById(db, 'eo');
  const list = await listRecords(db, actor, site, { page: 1 });
  assert.equal(list.rows.length, 25);
  assert.ok(list.total > 100);
  const found = await listRecords(db, actor, site, { search: list.rows[0].id });
  assert.equal(found.total, 1);
  await assert.rejects(() => listRecords(db, actor, 'site-b', {}));
});

test('PDF exports immutable snapshot and includes source lineage', async () => {
  const report = await run('eo', 'report.create', {
    title: 'Demo รายงานตรวจรับ PDF',
    from: day(2),
    to: day(1),
  });
  const bytes = await reportPdf(report, await one(db, 'SELECT * FROM sites WHERE id=$1', [site]));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 5000);
  assert.ok(bytes.toString('latin1').includes('/URI'));
});
