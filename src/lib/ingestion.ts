import type { DB } from './db';
import { fail, type Row } from './core';
import { validateRecord, businessKey } from './records';
export const importColumns = [
  'category',
  'asset_code',
  'parameter_code',
  'event_date',
  'value',
  'unit',
  'kind',
];
export async function previewImportRow(
  db: DB,
  site: string,
  raw: Row,
  mapping: Row,
  options: Row,
  row: number,
  checksum: string,
  keys: Set<string>,
) {
  const data: Row = {
    source: 'FILE_IMPORT',
    source_ref: '',
    note: '',
    payload: { source_row: row, source_file: options.filename || 'import.csv', source_hash: checksum },
  };
  for (const col of [...importColumns, 'source_ref', 'note', 'qualifier', 'raw_value'])
    data[col] = raw[mapping[col] || col] ?? data[col];
  let error = '';
  try {
    if (!['ISO', 'DMY', 'MDY'].includes(options.dateFormat) || !['CE', 'BE'].includes(options.calendar))
      fail('เลือกชนิดวันที่และปฏิทินให้ชัดเจน');
    let year: number, month: number, day: number;
    const parts = String(data.event_date).split(/[-/]/).map(Number);
    if (parts.length !== 3) fail('วันที่ไม่ถูกต้อง');
    if (options.dateFormat === 'ISO') [year, month, day] = parts;
    else if (options.dateFormat === 'DMY') [day, month, year] = parts;
    else [month, day, year] = parts;
    if (options.calendar === 'BE') year -= 543;
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
      (await db.query('SELECT 1 FROM record_families WHERE site_id=$1 AND business_key=$2', [site, key])).rows
        .length
    )
      fail('พบ business key ซ้ำ ไม่เขียนทับข้อมูลเดิม');
    keys.add(key);
  } catch (e) {
    error = e instanceof Error ? e.message : 'ข้อมูลไม่ถูกต้อง';
  }
  return { row, data, error };
}
