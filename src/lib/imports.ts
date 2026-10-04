import Papa from 'papaparse';
import type { DB } from './db';
import { type Actor, type Row, authorize, fail, required, hash, insert, id, one, event } from './core';
import { validateRecord, businessKey, createRecord } from './records';
import { readWorkbook } from './workbooks';
export async function importCommand(db: DB, a: Actor, site: string, action: string, input: Row) {
  authorize(a, site, 'entry');
  if (action === 'import.inspect') {
    if (!input.workbook) fail('กรุณาเลือกไฟล์ XLSX');
    return readWorkbook(input.workbook);
  }
  if (action === 'import.preview') {
    const csv = required(
      input.workbook ? (await readWorkbook(input.workbook, required(input.sheet, 'Sheet'))).csv : input.csv,
      'เนื้อหา CSV',
    );
    if (Buffer.byteLength(csv) > 2 * 1024 * 1024) fail('รองรับไม่เกิน 2 MB / 1,000 แถว');
    const mapping = input.mapping || {};
    const checksum = hash({
      csv,
      mapping,
      dateFormat: input.dateFormat,
      calendar: input.calendar,
      sheet: input.sheet || null,
    });
    const exists = (
      await db.query<Row>('SELECT * FROM import_batches WHERE site_id=$1 AND checksum=$2', [site, checksum])
    ).rows[0];
    if (exists) return exists;
    const parsed = Papa.parse<Row>(csv, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(),
    });
    if (parsed.errors.length) fail(`CSV ไม่ถูกต้อง: ${parsed.errors[0].message}`);
    if (parsed.data.length > 1000) fail('แบ่งไฟล์เป็นชุดไม่เกิน 1,000 แถว');
    const columns = ['category', 'asset_code', 'parameter_code', 'event_date', 'value', 'unit', 'kind'];
    for (const col of columns)
      if (!parsed.meta.fields?.includes(mapping[col] || col)) fail(`ไม่พบคอลัมน์ ${mapping[col] || col}`);
    const keys = new Set<string>();
    const rows = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const raw = parsed.data[i];
      const data: Row = {
        source: 'FILE_IMPORT',
        source_ref: '',
        note: '',
        payload: { source_row: i + 2, source_file: input.filename || 'import.csv', source_hash: checksum },
      };
      for (const col of [...columns, 'source_ref', 'note', 'qualifier', 'raw_value'])
        data[col] = raw[mapping[col] || col] ?? data[col];
      let error = '';
      try {
        if (!['ISO', 'DMY', 'MDY'].includes(input.dateFormat) || !['CE', 'BE'].includes(input.calendar))
          fail('เลือกชนิดวันที่และปฏิทินให้ชัดเจน');
        let year: number, month: number, day: number;
        const parts = String(data.event_date).split(/[-/]/).map(Number);
        if (parts.length !== 3) fail('วันที่ไม่ถูกต้อง');
        if (input.dateFormat === 'ISO') [year, month, day] = parts;
        else if (input.dateFormat === 'DMY') [day, month, year] = parts;
        else [month, day, year] = parts;
        if (input.calendar === 'BE') year -= 543;
        data.event_date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (String(data.value).trim() === '' || !Number.isFinite(Number(data.value)))
          fail('ค่าต้องเป็นตัวเลขที่ระบุชัดเจน');
        data.value = Number(data.value);
        if (!data.qualifier) delete data.qualifier;
        if (!data.raw_value) delete data.raw_value;
        await validateRecord(db, site, data, true);
        const key = businessKey(data);
        if (
          keys.has(key) ||
          (await db.query('SELECT 1 FROM record_families WHERE site_id=$1 AND business_key=$2', [site, key]))
            .rows.length
        )
          fail('พบ business key ซ้ำ ไม่เขียนทับข้อมูลเดิม');
        keys.add(key);
      } catch (e) {
        error = e instanceof Error ? e.message : 'ข้อมูลไม่ถูกต้อง';
      }
      rows.push({ row: i + 2, data, error });
    }
    const batch = await insert(db, 'import_batches', {
      id: id(),
      site_id: site,
      created_by: a.id,
      checksum,
      filename: input.filename || 'import.csv',
      mapping: JSON.stringify({ ...mapping, dateFormat: input.dateFormat, calendar: input.calendar }),
      rows: JSON.stringify(rows),
    });
    await event(db, a, site, 'import', batch.id, 'PREVIEW', null, {
      filename: batch.filename,
      total: rows.length,
    });
    return batch;
  }
  if (action !== 'import.confirm') fail('คำสั่ง import ไม่ถูกต้อง', 404);
  const batch = await one(db, 'SELECT * FROM import_batches WHERE id=$1 AND site_id=$2 FOR UPDATE', [
    input.id,
    site,
  ]);
  if (batch.created_by !== a.id) fail('เฉพาะผู้นำเข้าที่ยืนยันชุดข้อมูลได้', 403);
  if (batch.status === 'COMPLETED') return batch;
  if (batch.status !== 'PREVIEW') fail('Preview ยังไม่พร้อมหรืออยู่ระหว่างนำเข้า');
  const rows = batch.rows as Row[];
  const valid = rows.filter((r) => !r.error);
  if (!valid.length) fail('ไม่มีแถวที่ผ่านการตรวจ');
  if (valid.length !== rows.length && input.allowPartial !== true)
    fail('มีแถวผิดพลาด ต้องยืนยันนำเข้าเฉพาะแถวที่ผ่านอย่างชัดเจน');
  const result = [];
  for (const row of valid) {
    const record = await createRecord(db, a, site, {
      ...row.data,
      payload: { ...row.data.payload, batch_id: batch.id },
    });
    result.push({ row: row.row, id: record.id, status: record.status });
  }
  await db.query("UPDATE import_batches SET status='COMPLETED',result=$1 WHERE id=$2", [
    JSON.stringify({ imported: result, skipped: rows.filter((r) => r.error) }),
    batch.id,
  ]);
  await event(db, a, site, 'import', batch.id, 'CONFIRM', null, {
    imported: valid.length,
    skipped: rows.length - valid.length,
  });
  return one(db, 'SELECT * FROM import_batches WHERE id=$1', [batch.id]);
}
