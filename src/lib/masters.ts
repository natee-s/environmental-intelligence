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
  dateString,
} from './core';
export const masterKinds = [
  'SITE',
  'DEPARTMENT',
  'AREA',
  'UNIT',
  'PARAMETER',
  'ASSET',
  'PRODUCTION_UNIT',
  'PRODUCT',
  'WASTE_TYPE',
  'SCHEDULE',
  'CALENDAR',
  'CHECKLIST',
  'WORKFLOW',
  'RULE',
  'EXEMPTION',
  'COUNTER_RESET',
  'INTENSITY_TARGET',
];
function validateConfig(kind: string, c: Row) {
  if (kind === 'INTENSITY_TARGET') {
    const bases: Record<string, string> = { WATER: 'm3', WASTEWATER: 'm3', ENERGY: 'kWh', WASTE: 'kg' };
    if (!bases[c.category] || c.resource_unit !== bases[c.category])
      fail('หน่วยทรัพยากรของเป้าหมายไม่ตรงหมวด');
    if (!['t', 'piece'].includes(c.production_unit)) fail('เป้าหมายต้องระบุหน่วยฐานผลผลิต t หรือ piece');
    if (c.limit === null || c.limit === '' || !Number.isFinite(Number(c.limit)) || Number(c.limit) < 0)
      fail('เป้าหมายต่อหน่วยต้องเป็นค่าที่ไม่ติดลบ');
    required(c.reference, 'ที่มาและขอบเขตเป้าหมายภายใน');
    if (c.regulatory) fail('เป้าหมายประสิทธิภาพไม่ใช่เกณฑ์กฎหมาย');
  }
  if (kind === 'UNIT') {
    required(c.dimension, 'มิติหน่วย');
    if (!(Number(c.factor) > 0)) fail('ตัวคูณหน่วยต้องมากกว่า 0');
    required(c.base, 'หน่วยฐาน');
  }
  if (kind === 'PARAMETER') {
    if (!['WATER', 'WASTEWATER', 'ENERGY', 'WASTE', 'PRODUCTION'].includes(c.category))
      fail('หมวดพารามิเตอร์ไม่ถูกต้อง');
    required(c.dimension, 'มิติหน่วย');
  }
  if (kind === 'ASSET') {
    if (!['INTERVAL', 'CUMULATIVE'].includes(c.mode)) fail('เลือกชนิดมิเตอร์');
    if (!['INCLUDED', 'BREAKDOWN', 'EXCLUDED'].includes(c.boundary)) fail('เลือกขอบเขตการรวม');
    required(c.category, 'หมวด');
    required(c.unit, 'หน่วย');
  }
  if (kind === 'WASTE_TYPE' && !['GENERAL', 'HAZARDOUS', 'RECYCLE'].includes(c.classification))
    fail('ประเภทของเสียต้องเป็น GENERAL / HAZARDOUS / RECYCLE');
  if (kind === 'SCHEDULE') {
    required(c.asset, 'จุดวัด');
    required(c.parameter, 'พารามิเตอร์');
    if (!['DAILY', 'WEEKLY'].includes(c.frequency)) fail('รองรับรอบ DAILY หรือ WEEKLY');
    if (c.frequency === 'WEEKLY' && !(Number.isInteger(c.weekday) && c.weekday >= 0 && c.weekday <= 6))
      fail('วันประจำสัปดาห์ต้องอยู่ระหว่าง 0–6');
  }
  if (kind === 'WORKFLOW') {
    if (!Array.isArray(c.reviewers) || !c.reviewers.length) fail('สายอนุมัติต้องมีผู้ตรวจอย่างน้อยหนึ่งคน');
    if (!Array.isArray(c.checklist) || !c.checklist.length) fail('ต้องมี checklist ตรวจปิดงาน');
  }
  if (kind === 'RULE') {
    required(c.parameter, 'พารามิเตอร์');
    required(c.unit, 'หน่วย');
    required(c.reference, 'แหล่งอ้างอิง');
    if (!['>', '>=', '<', '<=', 'between'].includes(c.operator)) fail('เงื่อนไขไม่ถูกต้อง');
    if (!Number.isFinite(Number(c.threshold)) || c.threshold === null || c.threshold === '')
      fail('กรุณากำหนดค่าเกณฑ์ก่อนส่งตรวจ');
    if (
      c.operator === 'between' &&
      (!Number.isFinite(Number(c.upper)) || Number(c.upper) < Number(c.threshold))
    )
      fail('ช่วงเกณฑ์ไม่ถูกต้อง');
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(c.severity)) fail('ระดับความรุนแรงไม่ถูกต้อง');
  }
  if (kind === 'EXEMPTION') {
    required(c.schedule, 'รหัสตารางคาดหวัง');
    required(c.reason, 'เหตุผลยกเว้น');
  }
  if (kind === 'COUNTER_RESET') {
    required(c.asset, 'มิเตอร์');
    if (!Number.isFinite(Number(c.consumption)) || Number(c.consumption) < 0)
      fail('ต้องระบุปริมาณช่วง reset ที่ตรวจยืนยัน');
    required(c.reference, 'หลักฐาน reset');
  }
}
export async function masterCommand(db: DB, a: Actor, site: string, action: string, input: Row) {
  authorize(a, site, 'config');
  if (action === 'master.save') {
    const kind = required(input.kind, 'ชนิดข้อมูล');
    if (!masterKinds.includes(kind)) fail('ชนิด Master ไม่ถูกต้อง');
    const code = required(input.code, 'รหัส');
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(code)) fail('รหัสใช้ตัวอักษรอังกฤษ ตัวเลข _ และ -');
    const name = required(input.name, 'ชื่อ');
    const from = required(input.effective_from, 'วันที่มีผล');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) fail('วันที่ต้องเป็น ISO YYYY-MM-DD');
    const versions = (
      await db.query<Row>(
        'SELECT * FROM master_versions WHERE site_id=$1 AND kind=$2 AND code=$3 ORDER BY version DESC FOR UPDATE',
        [site, kind, code],
      )
    ).rows;
    if (versions.some((v) => ['DRAFT', 'SUBMITTED'].includes(v.status)))
      fail('มีฉบับร่างหรือรายการรอตรวจของรหัสนี้แล้ว', 409);
    if (versions.some((v) => v.status === 'ACTIVE' && dateString(v.effective_from) >= from))
      fail('รุ่นใหม่ต้องมีวันที่เริ่มหลังรุ่นที่ใช้งาน เพื่อไม่เปลี่ยนประวัติย้อนหลัง');
    if (input.effective_to && input.effective_to < from) fail('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    if (kind === 'EXEMPTION' && !input.effective_to) fail('ข้อยกเว้นต้องมีวันสิ้นสุด');
    const row = await insert(db, 'master_versions', {
      id: id(),
      site_id: site,
      kind,
      code,
      name,
      version: (versions[0]?.version || 0) + 1,
      status: 'DRAFT',
      effective_from: from,
      effective_to: input.effective_to || null,
      config: JSON.stringify(input.config || {}),
      created_by: a.id,
    });
    await event(db, a, site, 'master', row.id, 'CREATE', null, row);
    return row;
  }
  const row = await one(db, 'SELECT * FROM master_versions WHERE id=$1 AND site_id=$2 FOR UPDATE', [
    input.id,
    site,
  ]);
  if (action === 'master.edit') {
    if (row.status !== 'DRAFT' || row.created_by !== a.id) fail('แก้ได้เฉพาะฉบับร่างของตน');
    const from = input.effective_from || dateString(row.effective_from);
    const to =
      input.effective_to === undefined
        ? row.effective_to
          ? dateString(row.effective_to)
          : null
        : input.effective_to || null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || (to && (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from)))
      fail('ช่วงวันที่มีผลไม่ถูกต้อง');
    if (row.kind === 'EXEMPTION' && !to) fail('ข้อยกเว้นต้องมีวันสิ้นสุด');
    const active = (
      await db.query<Row>(
        "SELECT effective_from FROM master_versions WHERE site_id=$1 AND kind=$2 AND code=$3 AND status='ACTIVE'",
        [site, row.kind, row.code],
      )
    ).rows[0];
    if (active && dateString(active.effective_from) >= from) fail('รุ่นใหม่ต้องเริ่มหลังรุ่นที่ใช้งาน');
    await db.query(
      'UPDATE master_versions SET name=$1,config=$2,effective_from=$4,effective_to=$5 WHERE id=$3',
      [required(input.name, 'ชื่อ'), JSON.stringify(input.config || {}), row.id, from, to],
    );
  } else if (action === 'master.submit') {
    if (row.status !== 'DRAFT') fail('ต้องเป็นฉบับร่าง');
    if (row.created_by !== a.id) fail('ส่งตรวจได้เฉพาะผู้สร้าง', 403);
    validateConfig(row.kind, row.config);
    await db.query("UPDATE master_versions SET status='SUBMITTED' WHERE id=$1", [row.id]);
  } else if (action === 'master.approve') {
    authorize(a, site, 'review');
    separate(a, row.created_by);
    if (row.status !== 'SUBMITTED') fail('ต้องส่งตรวจก่อน');
    validateConfig(row.kind, row.config);
    if (row.kind === 'RULE' && row.config.regulatory && !input.confirmLegal)
      fail('ต้องยืนยันแหล่งอ้างอิงและการใช้เกณฑ์กฎหมายอย่างชัดเจน');
    if (
      row.kind === 'INTENSITY_TARGET' &&
      (
        await db.query(
          "SELECT 1 FROM master_versions WHERE site_id=$1 AND kind='INTENSITY_TARGET' AND approved_by IS NOT NULL AND code<>$2 AND config->>'category'=$3 AND config->>'production_unit'=$4 AND effective_from<=COALESCE($6::date,'infinity'::date) AND COALESCE(effective_to,'infinity'::date)>=$5::date",
          [
            site,
            row.code,
            row.config.category,
            row.config.production_unit,
            dateString(row.effective_from),
            row.effective_to ? dateString(row.effective_to) : null,
          ],
        )
      ).rows.length
    )
      fail('มีเป้าหมาย Site/หมวด/หน่วยผลิตในช่วงนี้แล้ว ใช้ revision ของรหัสเดิมเพื่อไม่ให้เป้าหมายซ้อนกัน');
    if (row.kind === 'WORKFLOW')
      for (const uid of row.config.reviewers) {
        const r = await db.query(
          "SELECT 1 FROM users u JOIN grants g ON u.id=g.user_id WHERE u.id=$1 AND u.active AND g.site_id=$2 AND g.role='ES'",
          [uid, site],
        );
        if (!r.rows.length) fail('ผู้ตรวจต้อง active และมีสิทธิ์ ES ใน Site นี้');
      }
    if (row.kind === 'ASSET') {
      const masters = (await activeMasters(db, site, 'ASSET', dateString(row.effective_from))).filter(
        (m) => m.code !== row.code,
      );
      masters.push(row);
      for (const asset of masters) {
        const visited = new Set([asset.code]);
        let parent = asset.config.parent;
        while (parent) {
          if (visited.has(parent)) fail('ลำดับมิเตอร์เป็นวงจร');
          visited.add(parent);
          const p = masters.find((m) => m.code === parent);
          if (!p) fail('ไม่พบมิเตอร์แม่ใน Site นี้');
          if (asset.config.boundary === 'INCLUDED' && p.config.boundary === 'INCLUDED')
            fail('มิเตอร์แม่และลูกห้ามรวม total ซ้ำ');
          parent = p.config.parent;
        }
      }
    }
    if (row.kind === 'SCHEDULE') {
      const all = await activeMasters(db, site, undefined, dateString(row.effective_from));
      const asset = all.find((m) => m.kind === 'ASSET' && m.code === row.config.asset),
        param = all.find((m) => m.kind === 'PARAMETER' && m.code === row.config.parameter);
      if (
        !asset ||
        !param ||
        asset.config.category !== param.config.category ||
        row.config.category !== param.config.category
      )
        fail('จุดวัด พารามิเตอร์ และหมวดในตารางต้องตรงกัน');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.config.due || '')) fail('เวลาครบกำหนดต้องเป็น HH:MM');
      if (
        all.some(
          (m) =>
            m.kind === 'SCHEDULE' &&
            m.code !== row.code &&
            m.config.asset === row.config.asset &&
            m.config.parameter === row.config.parameter &&
            m.config.kind === row.config.kind,
        )
      )
        fail('มีตารางคาดหวังสำหรับรายการนี้อยู่แล้ว');
    }
    if (row.kind === 'RULE') {
      const all = await activeMasters(db, site, undefined, dateString(row.effective_from));
      const p = all.find((m) => m.kind === 'PARAMETER' && m.code === row.config.parameter),
        u = all.find((m) => m.kind === 'UNIT' && m.code === row.config.unit);
      if (!p || !u || p.config.dimension !== u.config.dimension) fail('เกณฑ์และหน่วยต้องตรงกับพารามิเตอร์');
      if (
        row.config.asset &&
        !all.some(
          (m) => m.kind === 'ASSET' && m.code === row.config.asset && m.config.category === p.config.category,
        )
      )
        fail('จุดวัดของเกณฑ์ไม่ถูกต้อง');
    }
    await db.query(
      "UPDATE master_versions SET status='SUPERSEDED',effective_to=$1::date-1 WHERE site_id=$2 AND kind=$3 AND code=$4 AND status='ACTIVE'",
      [row.effective_from, site, row.kind, row.code],
    );
    await db.query("UPDATE master_versions SET status='ACTIVE',approved_by=$1 WHERE id=$2", [a.id, row.id]);
  } else if (action === 'master.deactivate') {
    authorize(a, site, 'review');
    required(input.reason, 'เหตุผล');
    if (row.status !== 'ACTIVE') fail('ปิดใช้งานได้เฉพาะรุ่นที่ใช้งานอยู่');
    const siteRow = await one(db, 'SELECT timezone FROM sites WHERE id=$1', [site]);
    // Preserve the complete site-local day and prior references; expire after today.
    await db.query(
      "UPDATE master_versions SET status='INACTIVE',effective_to=GREATEST(effective_from,$1::date) WHERE id=$2",
      [localDate(siteRow.timezone), row.id],
    );
  } else fail('คำสั่ง Master ไม่ถูกต้อง');
  const updated = await one(db, 'SELECT * FROM master_versions WHERE id=$1', [row.id]);
  await event(db, a, site, 'master', row.id, action, row, updated, input.reason || '');
  return updated;
}
