import type { DB } from './db';
import {
  type Actor,
  type Row,
  authorize,
  one,
  insert,
  id,
  required,
  fail,
  separate,
  event,
  activeMasters,
  localDate,
  conflict,
  notify,
  actorById,
  can,
  hash,
  dateString,
} from './core';
import { getEvidence, putEvidence } from './storage';
import { qualityFor } from './analytics';
export async function participants(db: DB, issue: Row) {
  const tasks = (await db.query<Row>('SELECT owner_id,completed_by FROM tasks WHERE issue_id=$1', [issue.id]))
    .rows;
  const actors = (
    await db.query<Row>(
      "SELECT actor_id FROM events WHERE entity_id=$1 AND action IN('issue.investigate','issue.plan','issue.submit','evidence.upload','task.start','task.done')",
      [issue.id],
    )
  ).rows;
  return [
    issue.created_by,
    issue.owner_id,
    ...tasks.flatMap((t) => [t.owner_id, t.completed_by]),
    ...actors.map((e) => e.actor_id),
  ];
}
export async function verificationSet(db: DB, issue: Row) {
  const tasks = (await db.query<Row>('SELECT * FROM tasks WHERE issue_id=$1 ORDER BY id', [issue.id])).rows;
  if (!tasks.length || tasks.some((t) => t.required && t.status !== 'DONE'))
    fail('ต้องทำ Action ที่บังคับให้เสร็จครบก่อนส่งตรวจ');
  const all = (
    await db.query<Row>('SELECT * FROM evidence WHERE issue_id=$1 ORDER BY document_id,version DESC', [
      issue.id,
    ])
  ).rows;
  const evidence = all.filter((e, i, a) => a.findIndex((x) => x.document_id === e.document_id) === i);
  if (!evidence.length) fail('ต้องแนบหลักฐานที่เปิดได้อย่างน้อยหนึ่งรายการ');
  for (const e of evidence) await getEvidence(e as Parameters<typeof getEvidence>[0]);
  const retests: Row[] = [];
  if (issue.workflow_snapshot.config.require_retest) {
    const tests = (
      await db.query<Row>(
        "SELECT * FROM record_versions WHERE site_id=$1 AND status='APPROVED' AND kind='LAB' AND payload->>'issue_id'=$2",
        [issue.site_id, issue.id],
      )
    ).rows;
    for (const r of tests) if ((await qualityFor(db, issue.site_id, r)).status === 'PASS') retests.push(r);
    if (!retests.length)
      fail('เกณฑ์นี้บังคับผลตรวจซ้ำที่อนุมัติและผ่านเกณฑ์ กรุณาเชื่อมผลแล็บกับ Issue ก่อน');
  }
  return {
    tasks,
    evidence,
    fingerprint: hash({
      tasks: tasks.map((t) => [t.id, t.version, t.status, t.result]),
      evidence: evidence.map((e) => [e.id, e.sha256]),
      retests: retests.map((r) => r.id).sort(),
    }),
  };
}
async function independent(db: DB, a: Actor, issue: Row) {
  authorize(a, issue.site_id, 'verify');
  separate(a, ...(await participants(db, issue)));
}
async function invalidate(db: DB, issue: Row) {
  if (['VERIFIED', 'WAITING_VERIFICATION'].includes(issue.status)) {
    await db.query(
      "UPDATE verifications SET status='INVALIDATED' WHERE issue_id=$1 AND status IN('VERIFIED','WAITING')",
      [issue.id],
    );
    await db.query("UPDATE issues SET status='ACTION_IN_PROGRESS' WHERE id=$1", [issue.id]);
  }
}
export async function issueCommand(db: DB, a: Actor, site: string, action: string, input: Row) {
  if (action === 'issue.create') {
    authorize(a, site, 'issue');
    const title = required(input.title, 'ชื่อประเด็น');
    if (title.length < 10 || title.length > 200) fail('ชื่อประเด็นต้องมี 10–200 ตัวอักษร');
    required(input.description, 'รายละเอียด');
    if (!['WATER', 'WASTEWATER', 'ENERGY', 'WASTE', 'DATA_QUALITY', 'OTHER'].includes(input.category))
      fail('หมวดไม่ถูกต้อง');
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(input.severity)) fail('ระดับความรุนแรงไม่ถูกต้อง');
    let source = input.source_record_id || null;
    if (source) await one(db, 'SELECT id FROM record_versions WHERE id=$1 AND site_id=$2', [source, site]);
    if (input.alert_id) {
      const alert = await one(db, 'SELECT * FROM alerts WHERE id=$1 AND site_id=$2 FOR UPDATE', [
        input.alert_id,
        site,
      ]);
      source = alert.record_id;
      if ((await db.query('SELECT 1 FROM issues WHERE alert_id=$1', [alert.id])).rows.length)
        fail('Alert นี้เชื่อมกับ Issue แล้ว', 409);
      await db.query("UPDATE alerts SET status='LINKED' WHERE id=$1", [alert.id]);
    }
    if (!source && !input.alert_id) required(input.source_reason, 'เหตุผลที่ไม่มีแหล่งข้อมูล');
    const wf = (await activeMasters(db, site, 'WORKFLOW')).find(Boolean);
    if (!wf) fail('กรุณาตั้งค่าสายอนุมัติที่ผ่านการตรวจ');
    if (input.alert_id) {
      const alert = await one(db, 'SELECT snapshot FROM alerts WHERE id=$1 AND site_id=$2', [
        input.alert_id,
        site,
      ]);
      if (alert.snapshot.rule?.config.require_retest) wf.config = { ...wf.config, require_retest: true };
    }
    if (
      input.detected_date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(input.detected_date) ||
        input.detected_date >
          localDate((await one(db, 'SELECT timezone FROM sites WHERE id=$1', [site])).timezone))
    )
      fail('วันที่พบประเด็นไม่ถูกต้องหรือเป็นอนาคต');
    const row = await insert(db, 'issues', {
      id: id(),
      site_id: site,
      number: `ENV-${localDate().slice(0, 4)}-${id().slice(0, 8).toUpperCase()}`,
      title,
      description:
        input.description + (input.source_reason ? `\nเหตุผลไม่มี source: ${input.source_reason}` : ''),
      category: input.category,
      severity: input.severity,
      created_by: a.id,
      detected_date: input.detected_date || localDate(),
      source_record_id: source,
      alert_id: input.alert_id || null,
      workflow_snapshot: JSON.stringify(wf),
    });
    await event(db, a, site, 'issue', row.id, action, null, row);
    return row;
  }
  authorize(a, site, 'read');
  const row = await one(db, 'SELECT * FROM issues WHERE id=$1 AND site_id=$2 FOR UPDATE', [input.id, site]);
  conflict(row, input.version);
  const reason = input.reason || '';
  const owner = () => {
    authorize(a, site, 'work');
    if (row.owner_id !== a.id) fail('ผู้รับผิดชอบงานเท่านั้นที่ดำเนินการได้', 403);
  };
  const state = (...states: string[]) => {
    if (!states.includes(row.status)) fail(`สถานะ ${row.status} ไม่สามารถดำเนินการนี้ได้`, 409);
  };
  let next = row.status;
  if (action === 'issue.assign') {
    authorize(a, site, 'assign');
    state('OPEN', 'REOPENED', 'ASSIGNED', 'INVESTIGATING', 'ACTION_IN_PROGRESS');
    const own = await actorById(db, required(input.owner_id, 'ผู้รับผิดชอบ'));
    const verifier = await actorById(db, required(input.verifier_id, 'ผู้ตรวจ'));
    if (!can(own, site, 'work') || !can(verifier, site, 'verify'))
      fail('ผู้รับผิดชอบหรือผู้ตรวจไม่มีสิทธิ์ใน Site นี้');
    if (own.id === verifier.id || verifier.id === row.created_by)
      fail('ผู้ตรวจต้องแยกจากผู้สร้างและผู้รับผิดชอบ');
    const due = required(input.due_date, 'กำหนดเสร็จ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) fail('กำหนดเสร็จต้องเป็นวันที่ ISO');
    if (row.owner_id) required(reason, 'เหตุผลมอบหมายใหม่/เปลี่ยนกำหนด');
    if (
      row.workflow_snapshot.config.reviewers?.length &&
      !row.workflow_snapshot.config.reviewers.includes(verifier.id)
    )
      fail('ผู้ตรวจไม่อยู่ในสายอนุมัติของ Issue นี้');
    await db.query(
      'UPDATE issues SET owner_id=$1,verifier_id=$2,due_date=$3,original_due=COALESCE(original_due,$3) WHERE id=$4',
      [own.id, verifier.id, due, row.id],
    );
    next = ['OPEN', 'REOPENED'].includes(row.status) ? 'ASSIGNED' : row.status;
  } else if (action === 'issue.investigate') {
    owner();
    state('ASSIGNED');
    required(input.note, 'ผลตรวจเบื้องต้น');
    await db.query('UPDATE issues SET investigation=$1 WHERE id=$2', [input.note, row.id]);
    next = 'INVESTIGATING';
  } else if (action === 'issue.plan') {
    owner();
    state('INVESTIGATING');
    required(input.root_cause, 'สาเหตุหรือเหตุผลที่ยังไม่ยืนยัน');
    required(input.description, 'Action ที่ต้องทำ');
    await insert(db, 'tasks', {
      id: id(),
      site_id: site,
      issue_id: row.id,
      description: input.description,
      owner_id: a.id,
      due_date: row.due_date,
    });
    await db.query('UPDATE issues SET root_cause=$1 WHERE id=$2', [input.root_cause, row.id]);
    next = 'ACTION_IN_PROGRESS';
  } else if (action === 'issue.submit') {
    owner();
    state('ACTION_IN_PROGRESS');
    required(input.note, 'สรุปผลการดำเนินการ');
    const set = await verificationSet(db, row);
    const cycles = await one(db, 'SELECT COALESCE(max(cycle),0) AS n FROM verifications WHERE issue_id=$1', [
      row.id,
    ]);
    await insert(db, 'verifications', {
      id: id(),
      issue_id: row.id,
      cycle: Number(cycles.n) + 1,
      status: 'WAITING',
      requested_by: a.id,
      checklist: JSON.stringify(row.workflow_snapshot.config.checklist),
      fingerprint: set.fingerprint,
    });
    await db.query('UPDATE issues SET completion=$1 WHERE id=$2', [input.note, row.id]);
    next = 'WAITING_VERIFICATION';
  } else if (action === 'issue.verify') {
    state('WAITING_VERIFICATION');
    await independent(db, a, row);
    if (row.verifier_id !== a.id) fail('เฉพาะผู้ตรวจที่ได้รับมอบหมาย', 403);
    required(input.note, 'ความเห็นตรวจสอบ');
    const checks = row.workflow_snapshot.config.checklist as string[];
    if (!checks.every((c) => input.checks?.[c] === true)) fail('ต้องตรวจ checklist ที่บังคับครบทุกข้อ');
    const set = await verificationSet(db, row);
    const cycle = await one(
      db,
      "SELECT * FROM verifications WHERE issue_id=$1 AND status='WAITING' ORDER BY cycle DESC LIMIT 1 FOR UPDATE",
      [row.id],
    );
    if (cycle.fingerprint !== set.fingerprint) fail('ชุด Action/หลักฐานเปลี่ยน กรุณาส่งตรวจใหม่', 409);
    await db.query(
      "UPDATE verifications SET status='VERIFIED',decided_by=$1,note=$2,checklist=$3 WHERE id=$4",
      [a.id, input.note, JSON.stringify(input.checks), cycle.id],
    );
    next = 'VERIFIED';
  } else if (action === 'issue.reject') {
    state('WAITING_VERIFICATION');
    await independent(db, a, row);
    required(reason, 'เหตุผลและสิ่งที่ต้องแก้');
    await db.query(
      "UPDATE verifications SET status='REJECTED',decided_by=$1,note=$2 WHERE issue_id=$3 AND status='WAITING'",
      [a.id, reason, row.id],
    );
    await db.query(
      "UPDATE tasks SET status='IN_PROGRESS',version=version+1 WHERE issue_id=$1 AND required=true",
      [row.id],
    );
    next = 'ACTION_IN_PROGRESS';
  } else if (action === 'issue.close') {
    state('VERIFIED');
    await independent(db, a, row);
    required(input.note, 'สรุปปิดงาน');
    const set = await verificationSet(db, row);
    const cycle = await one(
      db,
      "SELECT * FROM verifications WHERE issue_id=$1 AND status='VERIFIED' ORDER BY cycle DESC LIMIT 1",
      [row.id],
    );
    if (cycle.fingerprint !== set.fingerprint) fail('ชุดหลักฐานไม่ตรงกับรอบตรวจล่าสุด', 409);
    await db.query('UPDATE issues SET closure=$1,closed_at=now() WHERE id=$2', [input.note, row.id]);
    if (row.alert_id)
      await db.query("UPDATE alerts SET status='RESOLVED',episode_open=false WHERE id=$1", [row.alert_id]);
    next = 'CLOSED';
  } else if (action === 'issue.reopen') {
    state('CLOSED');
    authorize(a, site, 'verify');
    required(reason, 'เหตุผลและข้อค้นพบใหม่');
    await db.query('UPDATE issues SET closed_at=NULL WHERE id=$1', [row.id]);
    await db.query("UPDATE verifications SET status='INVALIDATED' WHERE issue_id=$1 AND status='VERIFIED'", [
      row.id,
    ]);
    next = 'REOPENED';
  } else if (action === 'issue.cancel') {
    state('OPEN', 'ASSIGNED');
    authorize(a, site, 'verify');
    required(reason, 'เหตุผลยกเลิก');
    next = 'CANCELLED';
  } else if (action === 'task.add') {
    owner();
    state('ACTION_IN_PROGRESS', 'VERIFIED');
    required(input.description, 'รายละเอียด Action');
    const taskOwner = await actorById(db, input.owner_id || a.id);
    if (!can(taskOwner, site, 'work') || taskOwner.id === row.verifier_id) fail('เจ้าของ Action ไม่ถูกต้อง');
    await insert(db, 'tasks', {
      id: id(),
      site_id: site,
      issue_id: row.id,
      description: input.description,
      owner_id: taskOwner.id,
      due_date: input.due_date || row.due_date,
    });
    await invalidate(db, row);
    next = 'ACTION_IN_PROGRESS';
  } else if (action === 'task.start' || action === 'task.done') {
    authorize(a, site, 'work');
    state('ACTION_IN_PROGRESS', 'VERIFIED');
    const task = await one(db, 'SELECT * FROM tasks WHERE id=$1 AND issue_id=$2 FOR UPDATE', [
      input.task_id,
      row.id,
    ]);
    if (task.owner_id !== a.id) fail('เฉพาะผู้รับผิดชอบ Action', 403);
    if (action === 'task.done') required(input.note, 'ผลการทำงาน');
    await db.query('UPDATE tasks SET status=$1,result=$2,completed_by=$3,version=version+1 WHERE id=$4', [
      action === 'task.done' ? 'DONE' : 'IN_PROGRESS',
      input.note || '',
      action === 'task.done' ? a.id : null,
      task.id,
    ]);
    await invalidate(db, row);
    next = 'ACTION_IN_PROGRESS';
  } else fail('คำสั่ง Issue ไม่ถูกต้อง');
  await db.query('UPDATE issues SET status=$1,version=version+1,updated_at=now() WHERE id=$2', [
    next,
    row.id,
  ]);
  const updated = await one(db, 'SELECT * FROM issues WHERE id=$1', [row.id]);
  const e = await event(db, a, site, 'issue', row.id, action, row, updated, reason || input.note || '');
  await notify(
    db,
    site,
    e.id,
    [updated.owner_id, updated.verifier_id, updated.created_by].filter((x) => x !== a.id),
    `${updated.number} • ${next}`,
    `/issues/${row.id}`,
  );
  return updated;
}
export async function evidenceCommand(db: DB, a: Actor, site: string, input: Row) {
  authorize(a, site, 'work');
  let issue: Row | undefined;
  if (input.issue_id) {
    issue = await one(db, 'SELECT * FROM issues WHERE id=$1 AND site_id=$2 FOR UPDATE', [
      input.issue_id,
      site,
    ]);
    conflict(issue, input.version);
    if (['CLOSED', 'CANCELLED'].includes(issue.status)) fail('ต้อง reopen ก่อนเพิ่มหลักฐาน');
    const assigned = (
      await db.query('SELECT 1 FROM tasks WHERE issue_id=$1 AND owner_id=$2', [issue.id, a.id])
    ).rows.length;
    if (issue.owner_id !== a.id && !assigned) fail('เฉพาะผู้ทำงานที่ได้รับมอบหมายเพิ่มหลักฐานได้', 403);
  } else if (input.record_id) {
    authorize(a, site, 'entry');
    const r = await one(db, 'SELECT * FROM record_versions WHERE id=$1 AND site_id=$2', [
      input.record_id,
      site,
    ]);
    if (r.status !== 'DRAFT' || r.created_by !== a.id) fail('แนบหลักฐานได้เฉพาะข้อมูลฉบับร่างของตน');
  } else fail('ต้องระบุ Issue หรือ record ของหลักฐาน');
  const filename = required(input.filename, 'ชื่อไฟล์');
  const bytes = Buffer.from(required(input.base64, 'ไฟล์'), 'base64');
  const storage = await putEvidence(filename, input.mime, bytes);
  let document = id(),
    version = 1;
  if (input.document_id) {
    const old = await one(
      db,
      'SELECT * FROM evidence WHERE document_id=$1 AND site_id=$2 ORDER BY version DESC LIMIT 1',
      [input.document_id, site],
    );
    if (old.issue_id !== (input.issue_id || null) || old.record_id !== (input.record_id || null))
      fail('รุ่นหลักฐานต้องอยู่ในรายการเดิม');
    document = old.document_id;
    version = old.version + 1;
  }
  const row = await insert(db, 'evidence', {
    id: id(),
    site_id: site,
    issue_id: input.issue_id || null,
    record_id: input.record_id || null,
    document_id: document,
    version,
    filename: filename.replace(/[\\/\r\n]/g, '_'),
    mime: input.mime,
    size: bytes.length,
    ...storage,
    uploaded_by: a.id,
  });
  if (issue) {
    await invalidate(db, issue);
    await db.query('UPDATE issues SET version=version+1,updated_at=now() WHERE id=$1', [issue.id]);
  }
  await event(db, a, site, 'evidence', issue?.id || row.record_id, 'evidence.upload', null, {
    id: row.id,
    sha256: row.sha256,
    filename: row.filename,
  });
  return row;
}
