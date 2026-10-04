import Papa from 'papaparse';
import type { DB } from './db';
import {
  actorById,
  authorize,
  required,
  fail,
  hash,
  id,
  insert,
  one,
  event,
  type Actor,
  type Row,
} from './core';
import { readWorkbook } from './workbooks';
import { importColumns, previewImportRow } from './ingestion';
import { businessKey, createRecord } from './records';
export async function enqueueImport(db: DB, actor: Actor, site: string, action: string, input: Row) {
  authorize(actor, site, 'entry');
  if (action === 'import.enqueue') {
    const csv = required(
      input.workbook ? (await readWorkbook(input.workbook, required(input.sheet, 'Sheet'))).csv : input.csv,
      'CSV',
    );
    if (Buffer.byteLength(csv) > 20 * 1024 * 1024) fail('ไฟล์ต้องไม่เกิน 20 MB');
    const parsed = Papa.parse<Row>(csv, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
    });
    if (parsed.errors.length || !parsed.data.length || parsed.data.length > 50000)
      fail('CSV ไม่ถูกต้อง หรือเกิน 50,000 แถว');
    const mapping = input.mapping || {};
    for (const c of importColumns)
      if (!parsed.meta.fields?.includes(mapping[c] || c)) fail('ไม่พบคอลัมน์ ' + (mapping[c] || c));
    if (!['ISO', 'DMY', 'MDY'].includes(input.dateFormat) || !['CE', 'BE'].includes(input.calendar))
      fail('เลือกชนิดวันที่และปฏิทิน');
    const checksum = hash({
      csv,
      mapping,
      dateFormat: input.dateFormat,
      calendar: input.calendar,
      sheet: input.sheet || null,
    });
    const existing = (
      await db.query<Row>('SELECT id FROM import_batches WHERE site_id=$1 AND checksum=$2', [site, checksum])
    ).rows[0];
    if (existing) return { batch_id: existing.id, existing: true };
    const batch = await insert(db, 'import_batches', {
      id: id(),
      site_id: site,
      created_by: actor.id,
      checksum,
      filename: input.filename || 'import.csv',
      mapping: JSON.stringify({ ...mapping, dateFormat: input.dateFormat, calendar: input.calendar }),
      rows: '[]',
      status: 'PREPARING',
    });
    const job = await insert(db, 'background_jobs', {
      id: id(),
      site_id: site,
      actor_id: actor.id,
      kind: 'IMPORT_PREVIEW',
      batch_id: batch.id,
      total: parsed.data.length,
      payload: JSON.stringify({
        raw: parsed.data,
        mapping,
        options: { dateFormat: input.dateFormat, calendar: input.calendar, filename: batch.filename },
      }),
    });
    await event(db, actor, site, 'import', batch.id, 'PREVIEW_QUEUED', null, {
      job: job.id,
      total: job.total,
    });
    return { job_id: job.id, batch_id: batch.id };
  }
  if (action === 'import.queue-confirm') {
    const batch = await one(db, 'SELECT * FROM import_batches WHERE id=$1 AND site_id=$2 FOR UPDATE', [
      input.id,
      site,
    ]);
    if (batch.created_by !== actor.id) fail('เฉพาะผู้นำเข้าที่ยืนยันได้', 403);
    if (['IMPORTING', 'COMPLETED'].includes(batch.status)) return { batch_id: batch.id };
    if (batch.status !== 'PREVIEW') fail('Preview ยังไม่พร้อม');
    const valid = batch.rows.filter((r: Row) => !r.error);
    if (!valid.length) fail('ไม่มีแถวที่ผ่านการตรวจ');
    if (valid.length !== batch.rows.length && input.allowPartial !== true)
      fail('ต้องยืนยัน partial import อย่างชัดเจน');
    await db.query("UPDATE import_batches SET status='IMPORTING',result=$1 WHERE id=$2", [
      JSON.stringify({ imported: [], skipped: batch.rows.filter((r: Row) => r.error) }),
      batch.id,
    ]);
    const job = await insert(db, 'background_jobs', {
      id: id(),
      site_id: site,
      actor_id: actor.id,
      kind: 'IMPORT_CONFIRM',
      batch_id: batch.id,
      total: valid.length,
    });
    await event(db, actor, site, 'import', batch.id, 'CONFIRM_QUEUED', null, {
      job: job.id,
      total: job.total,
      allowPartial: input.allowPartial === true,
    });
    return { job_id: job.id, batch_id: batch.id };
  }
  const job = await one(db, 'SELECT * FROM background_jobs WHERE id=$1 AND site_id=$2 FOR UPDATE', [
    input.id,
    site,
  ]);
  if (job.actor_id !== actor.id || job.status !== 'FAILED') fail('Retry ได้เฉพาะงานที่ผิดพลาดของตน');
  await db.query("UPDATE background_jobs SET status='QUEUED',error='',updated_at=now() WHERE id=$1", [
    job.id,
  ]);
  return { job_id: job.id, batch_id: job.batch_id };
}

/** Each chunk commits business rows and progress atomically. A restarted worker resumes at cursor. */
export async function processNextJob(db: DB) {
  let currentId: string | undefined;
  try {
    return await db.transaction(async (tx) => {
      const job = (
        await tx.query<Row>(
          "SELECT * FROM background_jobs WHERE status IN('QUEUED','RUNNING') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!job) return false;
      currentId = job.id;
      await one(tx, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [job.actor_id]);
      const actor = await actorById(tx, job.actor_id);
      authorize(actor, job.site_id, 'entry');
      const batch = await one(tx, 'SELECT * FROM import_batches WHERE id=$1 FOR UPDATE', [job.batch_id]);
      let cursor = job.cursor;
      if (job.kind === 'IMPORT_PREVIEW') {
        const rows: Row[] = batch.rows,
          keys = new Set(rows.filter((r) => !r.error).map((r) => businessKey(r.data)));
        const end = Math.min(job.total, cursor + 100);
        for (; cursor < end; cursor++)
          rows.push(
            await previewImportRow(
              tx,
              job.site_id,
              job.payload.raw[cursor],
              job.payload.mapping,
              job.payload.options,
              cursor + 2,
              batch.checksum,
              keys,
            ),
          );
        await tx.query('UPDATE import_batches SET rows=$1,status=$2 WHERE id=$3', [
          JSON.stringify(rows),
          cursor === job.total ? 'PREVIEW' : 'PREPARING',
          batch.id,
        ]);
      } else {
        const valid = batch.rows.filter((r: Row) => !r.error),
          result = batch.result;
        const end = Math.min(job.total, cursor + 50);
        for (; cursor < end; cursor++) {
          const row = valid[cursor];
          const record = await createRecord(tx, actor, job.site_id, {
            ...row.data,
            payload: { ...row.data.payload, batch_id: batch.id },
          });
          result.imported.push({ row: row.row, id: record.id, status: record.status });
        }
        await tx.query('UPDATE import_batches SET result=$1,status=$2 WHERE id=$3', [
          JSON.stringify(result),
          cursor === job.total ? 'COMPLETED' : 'IMPORTING',
          batch.id,
        ]);
      }
      const finished = cursor === job.total;
      await tx.query(
        "UPDATE background_jobs SET cursor=$1,status=$2,attempts=attempts+1,updated_at=now(),payload=CASE WHEN $2='COMPLETED' THEN '{}'::jsonb ELSE payload END WHERE id=$3",
        [cursor, finished ? 'COMPLETED' : 'RUNNING', job.id],
      );
      if (finished)
        await event(
          tx,
          actor,
          job.site_id,
          'import',
          batch.id,
          job.kind === 'IMPORT_PREVIEW' ? 'PREVIEW' : 'CONFIRM',
          null,
          { total: job.total, job: job.id },
        );
      return true;
    });
  } catch (e) {
    if (!currentId) throw e;
    const message = e instanceof Error ? e.message : 'Job failed';
    await db.query("UPDATE background_jobs SET status='FAILED',error=$1,updated_at=now() WHERE id=$2", [
      message.slice(0, 500),
      currentId,
    ]);
    return false;
  }
}
