import type { DB } from './db';
import { id, insert, dateString, localDate, type Row } from './core';
import { execute } from './service';
import { ieatParameters } from './ieat-reference';

// Fixed meeting fixture requested by the user: September 2026. Never replaces existing approved facts.
export async function seedSeptember(db: DB) {
  if (localDate() < '2026-09-30') return;
  const site = 'site-a';
  const add = async (kind: string, code: string, name: string, config: Row) => {
    if (
      (
        await db.query('SELECT 1 FROM master_versions WHERE site_id=$1 AND kind=$2 AND code=$3', [
          site,
          kind,
          code,
        ])
      ).rows.length
    )
      return;
    await insert(db, 'master_versions', {
      id: id(),
      site_id: site,
      kind,
      code,
      name,
      version: 1,
      status: 'ACTIVE',
      effective_from: '2026-09-01',
      config: JSON.stringify(config),
      created_by: 'admin',
      approved_by: 'es2',
    });
  };
  await add('WASTE_TYPE', 'RECYCLE', 'Demo • ขยะ Recycle (ไม่อันตราย)', {
    classification: 'RECYCLE',
    hazardous: false,
    recyclable: true,
  });
  for (const [code, name, type] of [
    ['WASTE-REC', 'ขยะ Recycle', 'RECYCLE'],
    ['WASTE-HAZ', 'ขยะอันตราย', 'HAZARDOUS'],
    ['WASTE-GENERAL', 'ขยะทั่วไป', 'GENERAL'],
  ]) {
    await add('ASSET', code, 'Demo • ' + name, {
      category: 'WASTE',
      unit: 'kg',
      mode: 'INTERVAL',
      boundary: 'BREAKDOWN',
      parent: 'WASTE-GEN',
      waste_type: type,
      multiplier: 1,
      area: 'FACTORY',
    });
    await add('SCHEDULE', code + '_DAILY', 'Demo • ตาราง ' + name, {
      category: 'WASTE',
      asset: code,
      parameter: 'WASTE_MASS',
      kind: 'GENERATED',
      frequency: 'DAILY',
      due: '23:59',
      calendar: 'OPERATING',
    });
  }
  for (const [category, unit, limit] of [
    ['WATER', 'm3', 6.5],
    ['WASTEWATER', 'm3', 5],
    ['ENERGY', 'kWh', 140],
    ['WASTE', 'kg', 4.2],
  ])
    await add(
      'INTENSITY_TARGET',
      'DEMO_INTENSITY_' + category,
      'Demo • เป้าหมาย ' + category + ' ต่อผลผลิต',
      {
        category,
        resource_unit: unit,
        production_unit: 't',
        limit,
        demo: true,
        regulatory: false,
        reference: 'Demo training target only — ไม่ใช่ benchmark หรือเกณฑ์ของโรงงานจริง',
      },
    );
  const record = async (input: Row) => {
    const found = (
      await db.query<Row>(
        'SELECT * FROM record_versions WHERE site_id=$1 AND asset_code=$2 AND parameter_code=$3 AND event_date=$4::date AND kind=$5 ORDER BY version DESC LIMIT 1',
        [site, input.asset_code, input.parameter_code, input.event_date, input.kind],
      )
    ).rows[0];
    if (found) return found;
    let r = await execute(
      db,
      'eo',
      'record.create',
      site,
      { source: 'MANUAL', note: 'Demo • กันยายน 2569 ข้อมูลสมมติสำหรับประชุม ไม่ใช่ผลของโรงงาน', ...input },
      id(),
    );
    r = await execute(db, 'eo', 'record.submit', site, { id: r.id, version: r.lock_version }, id());
    return execute(db, 'es1', 'record.approve', site, { id: r.id, version: r.lock_version }, id());
  };
  for (let day = 1; day <= 30; day++) {
    const date = `2026-09-${String(day).padStart(2, '0')}`,
      weekDay = new Date(date).getUTCDay();
    const production =
      day === 13 ? 0 : Math.round((weekDay === 0 ? 17 : 28) + Math.sin(day * 0.65) * 5 + (day % 3));
    const water =
      production === 0
        ? 42
        : Math.round(34 + production * (4.8 + (day === 18 ? 2.5 : 0) + Math.sin(day * 0.4) * 0.3));
    const energy =
      production === 0
        ? 860
        : Math.round(520 + production * (111 + (day >= 17 && day <= 19 ? 32 : 0) + Math.sin(day * 0.8) * 8));
    const waste =
      production === 0
        ? 18
        : Math.round(15 + production * (2.6 + (day === 22 ? 1.5 : 0) + Math.cos(day * 0.5) * 0.3));
    for (const [category, asset, parameter, unit, kind, value] of [
      ['PRODUCTION', 'LINE-ALL', 'OUTPUT', 't', 'PRODUCTION', production],
      ['WATER', 'W-MAIN', 'WATER_USE', 'm3', 'CONSUMED', water],
      ['WASTEWATER', 'WW-OUT', 'WW_TREATED', 'm3', 'TREATED', Math.round(water * 0.72)],
      ['ENERGY', 'E-MAIN', 'ELECTRICITY', 'kWh', 'CONSUMED', energy],
      ['WASTE', 'WASTE-GEN', 'WASTE_MASS', 'kg', 'GENERATED', waste],
    ])
      await record({
        category,
        asset_code: asset,
        parameter_code: parameter,
        unit,
        kind,
        value,
        event_date: date,
        note:
          production === 0
            ? 'Demo • กันยายน 2569 หยุดผลิตตามแผน แต่มี base load และน้ำทำความสะอาด'
            : 'Demo • กันยายน 2569 ข้อมูลสมมติสำหรับประชุม ไม่ใช่ผลของโรงงาน',
      });
    const lab: Record<string, number> = {
      PH: day === 23 ? 9.3 : Number((7.15 + Math.sin(day * 0.4) * 0.45).toFixed(2)),
      BOD: Math.round(220 + Math.sin(day * 0.4) * 42 + (day === 18 ? 240 : 0)),
      COD: Math.round(450 + Math.sin(day * 0.4) * 85 + (day === 18 ? 380 : 0)),
      TSS: Math.round(85 + Math.sin(day * 0.6) * 16 + (day === 18 ? 150 : 0)),
      TDS: Math.round(1100 + Math.cos(day * 0.3) * 160),
      OIL_GREASE: day === 23 ? 11.4 : Number((4 + Math.sin(day * 0.35)).toFixed(2)),
      TKN: Math.round(32 + Math.sin(day * 0.5) * 6),
      TEMPERATURE: Number((31 + Math.sin(day * 0.3)).toFixed(1)),
    };
    for (const p of ieatParameters)
      await record({
        category: 'WASTEWATER',
        asset_code: 'LAB-IEAT',
        parameter_code: p.code,
        event_date: date,
        value: lab[p.code],
        unit: p.unit,
        kind: 'LAB',
        source: 'LAB',
        source_ref: 'DEMO-IEAT-' + date,
        payload: { received_date: date },
      });
  }
  const parents = (
    await db.query<Row>(
      "SELECT * FROM record_versions WHERE site_id=$1 AND asset_code='WASTE-GEN' AND kind='GENERATED' AND status='APPROVED' AND (event_date BETWEEN '2026-09-01' AND '2026-09-30' OR event_date>=$2::date) AND demo=true",
      [site, new Date(Date.parse(localDate()) - 7 * 86400000).toISOString().slice(0, 10)],
    )
  ).rows;
  for (const parent of parents) {
    const date = dateString(parent.event_date),
      day = Number(date.slice(-2)),
      total = Number(parent.value);
    const recyclable = Number((total * (0.48 + Math.sin(day * 0.45) * 0.05)).toFixed(2)),
      hazardous = Number((total * (day === 22 ? 0.23 : 0.13)).toFixed(2)),
      general = Number((total - recyclable - hazardous).toFixed(2));
    for (const [asset, value, type] of [
      ['WASTE-REC', recyclable, 'RECYCLE'],
      ['WASTE-HAZ', hazardous, 'HAZARDOUS'],
      ['WASTE-GENERAL', general, 'GENERAL'],
    ])
      await record({
        category: 'WASTE',
        asset_code: asset,
        parameter_code: 'WASTE_MASS',
        event_date: date,
        value,
        unit: 'kg',
        kind: 'GENERATED',
        payload: { waste_type: type, demo_parent_id: parent.id },
        note: 'Demo • สัดส่วนประเภทสมมติที่กระทบยอดกับยอดหลักเดิม ไม่ใช่ผลคัดแยกจริง',
      });
  }
}
