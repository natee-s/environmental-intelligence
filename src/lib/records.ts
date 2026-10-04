import { z } from 'zod';
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
  supervisors,
  dateString,
} from './core';
const recordSchema = z.object({
  category: z.enum(['WATER', 'WASTEWATER', 'ENERGY', 'WASTE', 'PRODUCTION']),
  asset_code: z.string().min(1),
  parameter_code: z.string().min(1),
  event_date: z.iso.date(),
  value: z.union([z.number().nonnegative(), z.null()]),
  unit: z.string().min(1),
  kind: z.enum([
    'CONSUMED',
    'TREATED',
    'DISCHARGED',
    'GENERATED',
    'TRANSFERRED',
    'RECYCLED',
    'DISPOSED',
    'PRODUCTION',
    'LAB',
    'DEMAND',
    'RENEWABLE',
    'EXPORTED',
  ]),
  raw_value: z.string().optional(),
  qualifier: z.enum(['', '<', '<=', '>', '>=']).optional(),
  source: z.enum(['MANUAL', 'LAB', 'DEVICE', 'FILE_IMPORT']),
  source_ref: z.string().max(200).default(''),
  note: z.string().max(4000).default(''),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export async function validateRecord(db: DB, site: string, data: Row, complete = true) {
  const parsed = recordSchema.safeParse({
    ...data,
    value:
      data.value === null || data.value === undefined || String(data.value).trim() === ''
        ? null
        : typeof data.value === 'boolean'
          ? NaN
          : Number(data.value),
    raw_value: data.raw_value ?? undefined,
    qualifier: data.qualifier ?? undefined,
  });
  if (!parsed.success) fail(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(';'));
  const r = parsed.data!;
  const siteRow = await one(db, 'SELECT * FROM sites WHERE id=$1', [site]);
  if (r.event_date > localDate(siteRow.timezone)) fail('ไม่สามารถบันทึกค่าที่เกิดขึ้นจริงในอนาคต');
  const all = await activeMasters(db, site, undefined, r.event_date);
  const parameter = all.find((m) => m.kind === 'PARAMETER' && m.code === r.parameter_code);
  const asset = all.find((m) => m.kind === 'ASSET' && m.code === r.asset_code);
  const unit = all.find((m) => m.kind === 'UNIT' && m.code === r.unit);
  if (!parameter || parameter.config.category !== r.category) fail('พารามิเตอร์ไม่ตรงหมวดหรือยังไม่เปิดใช้');
  if (!asset || asset.config.category !== r.category) fail('จุดวัดไม่ตรง Site/หมวด หรือยังไม่เปิดใช้');
  if (!unit || unit.config.dimension !== parameter.config.dimension) fail('หน่วยไม่ตรงมิติของพารามิเตอร์');
  if (parameter.config.kinds && !parameter.config.kinds.includes(r.kind)) fail('ชนิดรายการไม่ตรงพารามิเตอร์');
  if (asset.config.measurement_type === 'LAB' && r.kind !== 'LAB')
    fail('จุดเก็บตัวอย่างแล็บใช้เฉพาะผลตรวจ LAB');
  const wasteCode = r.category === 'WASTE' ? r.payload.waste_type || asset.config.waste_type : null;
  const wasteType = wasteCode ? all.find((m) => m.kind === 'WASTE_TYPE' && m.code === wasteCode) : null;
  if (wasteCode && !wasteType) fail('ประเภทของเสียไม่ตรง Site/วันมีผล หรือยังไม่อนุมัติ');
  if (
    r.category === 'WASTE' &&
    asset.config.waste_type &&
    r.payload.waste_type &&
    asset.config.waste_type !== r.payload.waste_type
  )
    fail('ประเภทของเสียไม่ตรงจุดบันทึกที่ตั้งไว้');
  const baseByDimension: Record<string, string> = {
    volume: 'm3',
    energy: 'kWh',
    power: 'kW',
    mass: 'kg',
    concentration: 'mg_L',
    ph: 'pH',
    temperature: 'degC',
  };
  if (
    baseByDimension[parameter.config.dimension] &&
    unit.config.base !== baseByDimension[parameter.config.dimension]
  )
    fail('หน่วยยังไม่มีการแปลงสู่หน่วยฐานของ KPI ที่ยืนยันแล้ว');
  if (r.payload.issue_id)
    await one(db, 'SELECT id FROM issues WHERE id=$1 AND site_id=$2', [r.payload.issue_id, site]);
  if (r.payload.received_date && String(r.payload.received_date) < r.event_date)
    fail('วันรับผลแล็บต้องไม่ก่อนวันเก็บตัวอย่าง');
  if (complete && r.value === null) fail('กรุณาระบุค่าก่อนส่งตรวจ');
  if (parameter.config.dimension === 'ph' && r.value !== null && r.value > 14)
    fail('ค่า pH ต้องอยู่ระหว่าง 0–14');
  if (r.category === 'PRODUCTION' && r.value === 0 && !r.note.trim())
    fail('ยืนยันการผลิตเป็นศูนย์ด้วยเหตุผล เช่น หยุดผลิต');
  if (r.kind === 'LAB') {
    required(r.source_ref, 'Sample ID');
    if (r.qualifier && !r.raw_value) fail('ค่าผลแล็บแบบช่วงต้องเก็บ raw result');
    if (r.raw_value) {
      const match = r.raw_value.trim().match(/^([<>]=?)?\s*(\d+(?:\.\d+)?)$/);
      if (!match || Number(match[2]) !== r.value || (match[1] || '') !== (r.qualifier || ''))
        fail('ค่าดิบผลแล็บต้องตรงกับค่าและ qualifier ที่ระบุ ห้ามแปลง <5 เป็นค่าแน่นอน');
    }
  }
  if (r.category === 'WASTE' && ['TRANSFERRED', 'RECYCLED', 'DISPOSED'].includes(r.kind)) {
    required(r.source_ref, 'Shipment/Lot ID');
    const duplicate = await db.query(
      "SELECT id FROM record_versions WHERE site_id=$1 AND source_ref=$2 AND asset_code=$3 AND kind IN ('RECYCLED','DISPOSED') AND status IN ('DRAFT','SUBMITTED','APPROVED') AND family_id<>$4",
      [site, r.source_ref, r.asset_code, data.family_id || 'new'],
    );
    if (['RECYCLED', 'DISPOSED'].includes(r.kind) && duplicate.rows.length)
      fail('Shipment นี้มีปลายทางการจัดการแล้ว ห้ามนับ recycled/disposed ซ้ำ');
  }
  return {
    ...r,
    config_snapshot: {
      parameter,
      asset,
      unit,
      wasteType,
      workflow: all.find((m) => m.kind === 'WORKFLOW') || null,
    },
  };
}
export function businessKey(r: Row) {
  return [
    r.category,
    r.asset_code,
    r.parameter_code,
    r.event_date,
    r.kind,
    ['LAB', 'TRANSFERRED', 'RECYCLED', 'DISPOSED'].includes(r.kind) ? r.source_ref : '',
  ].join('|');
}
export async function createRecord(db: DB, a: Actor, site: string, input: Row) {
  authorize(a, site, 'entry');
  const r = await validateRecord(db, site, input, false);
  const key = businessKey(r);
  if (
    (await db.query('SELECT 1 FROM record_families WHERE site_id=$1 AND business_key=$2', [site, key])).rows
      .length
  )
    fail('พบรายการซ้ำในจุดวัด/พารามิเตอร์/ช่วงเวลา ใช้สร้าง revision แทน', 409);
  const family = await insert(db, 'record_families', {
    id: id(),
    site_id: site,
    business_key: key,
    created_by: a.id,
  });
  const row = await insert(db, 'record_versions', {
    ...r,
    id: id(),
    family_id: family.id,
    site_id: site,
    version: 1,
    status: 'DRAFT',
    created_by: a.id,
    demo: a.demo,
    config_snapshot: JSON.stringify(r.config_snapshot),
    payload: JSON.stringify(r.payload),
  });
  await event(db, a, site, 'record', row.id, 'CREATE', null, row);
  return row;
}
export async function recordCommand(db: DB, a: Actor, site: string, action: string, input: Row) {
  if (action === 'record.create') return createRecord(db, a, site, input);
  authorize(
    a,
    site,
    action === 'record.approve' || action === 'record.reject' || action === 'record.void'
      ? 'review'
      : 'entry',
  );
  const row = await one(db, 'SELECT * FROM record_versions WHERE id=$1 AND site_id=$2 FOR UPDATE', [
    input.id,
    site,
  ]);
  await one(db, 'SELECT * FROM record_families WHERE id=$1 FOR UPDATE', [row.family_id]);
  conflict(row, input.version, 'lock_version');
  if (action === 'record.revise') {
    if (!['APPROVED', 'REJECTED', 'VOIDED'].includes(row.status))
      fail('สร้าง revision จากรายการที่อนุมัติ ถูกปฏิเสธ หรือ void เท่านั้น');
    required(input.reason, 'เหตุผลแก้ไข');
    if (
      (
        await db.query(
          "SELECT 1 FROM record_versions WHERE family_id=$1 AND status IN('DRAFT','SUBMITTED')",
          [row.family_id],
        )
      ).rows.length
    )
      fail('มี revision รอดำเนินการแล้ว', 409);
    const r = await validateRecord(
      db,
      site,
      { ...row, event_date: dateString(row.event_date), ...input.data },
      false,
    );
    if (businessKey(r) !== businessKey({ ...row, event_date: dateString(row.event_date) }))
      fail('revision ต้องคงจุดวัด ชนิด และวันที่เดิม; กรณีผิดรายการให้ void แล้วสร้างใหม่');
    const v = await one(db, 'SELECT max(version) AS n FROM record_versions WHERE family_id=$1', [
      row.family_id,
    ]);
    const rev = await insert(db, 'record_versions', {
      ...r,
      id: id(),
      family_id: row.family_id,
      site_id: site,
      version: Number(v.n) + 1,
      status: 'DRAFT',
      created_by: a.id,
      demo: row.demo,
      reason: input.reason,
      config_snapshot: JSON.stringify(r.config_snapshot),
      payload: JSON.stringify(r.payload),
    });
    await event(db, a, site, 'record', rev.id, 'REVISION', row, rev, input.reason);
    return rev;
  }
  if (action === 'record.edit') {
    if (row.status !== 'DRAFT' || row.created_by !== a.id) fail('แก้ไขได้เฉพาะฉบับร่างของตน', 403);
    const r = await validateRecord(
      db,
      site,
      { ...row, event_date: dateString(row.event_date), ...input.data },
      false,
    );
    if (businessKey(r) !== businessKey({ ...row, event_date: dateString(row.event_date) }))
      fail('จุดวัดและวันที่เป็นรหัสประจำรายการ ไม่สามารถเปลี่ยนได้');
    await db.query(
      'UPDATE record_versions SET value=$1,note=$2,raw_value=$3,qualifier=$4,unit=$5,source=$6,source_ref=$7,payload=$8,config_snapshot=$9,lock_version=lock_version+1 WHERE id=$10',
      [
        r.value,
        r.note,
        r.raw_value || null,
        r.qualifier || null,
        r.unit,
        r.source,
        r.source_ref,
        JSON.stringify(r.payload),
        JSON.stringify(r.config_snapshot),
        row.id,
      ],
    );
  } else if (action === 'record.submit') {
    if (row.status !== 'DRAFT' || row.created_by !== a.id) fail('ส่งตรวจได้เฉพาะฉบับร่างของตน');
    await validateRecord(
      db,
      site,
      {
        ...row,
        event_date: dateString(row.event_date),
        value: row.value === null ? null : Number(row.value),
      },
      true,
    );
    await db.query(
      "UPDATE record_versions SET status='SUBMITTED',submitted_by=$1,lock_version=lock_version+1 WHERE id=$2",
      [a.id, row.id],
    );
  } else if (action === 'record.approve') {
    if (row.status !== 'SUBMITTED') fail('รายการต้องอยู่ในสถานะรอตรวจ');
    separate(a, row.created_by, row.submitted_by);
    const wf = row.config_snapshot.workflow;
    if (wf?.config.reviewers?.length && !wf.config.reviewers.includes(a.id))
      fail('คุณไม่ได้รับมอบหมายในสายอนุมัติของรายการนี้', 403);
    await validateRecord(
      db,
      site,
      {
        ...row,
        event_date: dateString(row.event_date),
        value: row.value === null ? null : Number(row.value),
      },
      true,
    );
    const prior = (
      await db.query<Row>("SELECT * FROM record_versions WHERE family_id=$1 AND status='APPROVED'", [
        row.family_id,
      ])
    ).rows[0];
    if (prior) {
      await db.query(
        "UPDATE record_versions SET status='SUPERSEDED',lock_version=lock_version+1 WHERE id=$1",
        [prior.id],
      );
      await db.query('UPDATE alerts SET source_changed=true,episode_open=false WHERE record_id=$1', [
        prior.id,
      ]);
    }
    await db.query(
      "UPDATE record_versions SET status='APPROVED',approved_by=$1,approved_at=now(),lock_version=lock_version+1 WHERE id=$2",
      [a.id, row.id],
    );
  } else if (action === 'record.reject') {
    if (row.status !== 'SUBMITTED') fail('รายการต้องอยู่ในสถานะรอตรวจ');
    separate(a, row.created_by, row.submitted_by);
    required(input.reason, 'เหตุผลปฏิเสธ');
    await db.query(
      "UPDATE record_versions SET status='REJECTED',reason=$1,lock_version=lock_version+1 WHERE id=$2",
      [input.reason, row.id],
    );
  } else if (action === 'record.void') {
    if (row.status !== 'APPROVED') fail('void ได้เฉพาะรายการที่อนุมัติแล้ว');
    separate(a, row.created_by, row.submitted_by);
    required(input.reason, 'เหตุผล void');
    await db.query("UPDATE record_versions SET status='VOIDED',lock_version=lock_version+1 WHERE id=$1", [
      row.id,
    ]);
    await db.query('UPDATE alerts SET source_changed=true,episode_open=false WHERE record_id=$1', [row.id]);
  } else fail('คำสั่งข้อมูลไม่ถูกต้อง');
  const updated = await one(db, 'SELECT * FROM record_versions WHERE id=$1', [row.id]);
  const e = await event(db, a, site, 'record', row.id, action, row, updated, input.reason || '');
  await notify(
    db,
    site,
    e.id,
    action === 'record.submit' ? await supervisors(db, site) : [row.created_by],
    action === 'record.submit' ? 'มีข้อมูลรอตรวจ' : 'สถานะข้อมูลได้รับการปรับปรุง',
    `/data/${row.id}`,
  );
  return updated;
}
