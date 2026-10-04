import type { DB } from './db';
import { id, insert, localDate, type Row } from './core';
import { execute } from './service';
import { seedDashboardFixtures } from './seed-dashboard';
import { seedSeptember } from './seed-september';
export async function seed(db: DB, options: { monthly?: boolean } = {}) {
  if (!(await db.query("SELECT 1 FROM organizations WHERE id='demo-org'")).rows.length)
    await db.transaction(async (tx) => {
      await insert(tx, 'organizations', { id: 'demo-org', name: 'Demo • โรงงานอุตสาหกรรมสีเขียว' });
      for (const [sid, code, name] of [
        ['site-a', 'AYT', 'Demo • โรงงานอยุธยา'],
        ['site-b', 'RYG', 'Demo • โรงงานระยอง'],
      ])
        await insert(tx, 'sites', { id: sid, organization_id: 'demo-org', code, name, demo: true });
      const users = [
        ['eo', 'นาย A • เจ้าหน้าที่สิ่งแวดล้อม', 'EO', 'site-a'],
        ['es1', 'นาย B • หัวหน้างาน', 'ES', 'site-a'],
        ['es2', 'นาย C • ผู้ตรวจสอบอิสระ', 'ES', 'site-a'],
        ['owner', 'นาย D • ผู้รับผิดชอบผลิต', 'DO', 'site-a'],
        ['manager', 'นาย E • ผู้บริหาร', 'MG', 'site-a'],
        ['admin', 'นาย F • ผู้ดูแลระบบ', 'SA', 'site-a'],
        ['auditor', 'นาย G • ผู้ตรวจประเมิน', 'AV', 'site-a'],
        ['eo-b', 'นาย H • เจ้าหน้าที่ Site B', 'EO', 'site-b'],
      ];
      for (const [uid, name, role, site] of users) {
        await insert(tx, 'users', {
          id: uid,
          organization_id: 'demo-org',
          email: `${uid}@demo.local`,
          name,
          active: true,
          demo: true,
        });
        await insert(tx, 'grants', { user_id: uid, site_id: site, role });
      }
      for (const site of ['site-a', 'site-b']) {
        const master = async (kind: string, code: string, name: string, config: Row, status = 'ACTIVE') =>
          insert(tx, 'master_versions', {
            id: id(),
            site_id: site,
            kind,
            code,
            name,
            version: 1,
            status,
            effective_from: '2020-01-01',
            config: JSON.stringify(config),
            created_by: 'admin',
            approved_by: status === 'ACTIVE' ? 'es2' : null,
          });
        await master('SITE', 'SITE', 'ข้อมูลโรงงาน', { timezone: 'Asia/Bangkok' });
        await master('DEPARTMENT', 'ENV', 'แผนกสิ่งแวดล้อม', {});
        await master('AREA', 'FACTORY', 'พื้นที่โรงงาน', { department: 'ENV' });
        for (const [code, name, dimension, factor, base] of [
          ['m3', 'ลูกบาศก์เมตร', 'volume', 1, 'm3'],
          ['L', 'ลิตร', 'volume', 0.001, 'm3'],
          ['kWh', 'กิโลวัตต์ชั่วโมง', 'energy', 1, 'kWh'],
          ['kW', 'กิโลวัตต์', 'power', 1, 'kW'],
          ['kg', 'กิโลกรัม', 'mass', 1, 'kg'],
          ['t', 'ตันผลิตภัณฑ์', 'production_mass', 1, 't'],
          ['production_kg', 'กิโลกรัมผลิตภัณฑ์', 'production_mass', 0.001, 't'],
          ['piece', 'ชิ้นผลิตภัณฑ์', 'production_count', 1, 'piece'],
          ['mg_L', 'มิลลิกรัมต่อลิตร', 'concentration', 1, 'mg_L'],
          ['pH', 'pH', 'ph', 1, 'pH'],
        ])
          await master('UNIT', String(code), String(name), { dimension, factor, base });
        await master('PRODUCTION_UNIT', 'FINISHED_TONNE', 'ตันผลิตภัณฑ์สำเร็จรูป', {
          unit: 't',
          default: true,
        });
        await master('PRODUCT', 'FINISHED', 'ผลิตภัณฑ์สำเร็จรูป', {});
        await master('WASTE_TYPE', 'GENERAL', 'ขยะทั่วไป', {
          classification: 'GENERAL',
          hazardous: false,
          recyclable: false,
          evidence_required: true,
        });
        await master('WASTE_TYPE', 'HAZARDOUS', 'ของเสียอันตราย', {
          classification: 'HAZARDOUS',
          hazardous: true,
          evidence_required: true,
        });
        const definitions = [
          ['WATER', 'WATER_USE', 'ปริมาณน้ำใช้', 'volume', 'W-MAIN', 'มิเตอร์น้ำหลัก', 'm3', ['CONSUMED']],
          [
            'WASTEWATER',
            'WW_TREATED',
            'ปริมาณน้ำเสียบำบัด',
            'volume',
            'WW-OUT',
            'จุดวัดน้ำเสียบำบัด',
            'm3',
            ['TREATED', 'DISCHARGED'],
          ],
          [
            'ENERGY',
            'ELECTRICITY',
            'พลังงานไฟฟ้า',
            'energy',
            'E-MAIN',
            'มิเตอร์ไฟฟ้าหลัก',
            'kWh',
            ['CONSUMED', 'RENEWABLE', 'EXPORTED'],
          ],
          [
            'WASTE',
            'WASTE_MASS',
            'ปริมาณขยะ',
            'mass',
            'WASTE-GEN',
            'จุดรวบรวมขยะ',
            'kg',
            ['GENERATED', 'TRANSFERRED', 'RECYCLED', 'DISPOSED'],
          ],
          [
            'PRODUCTION',
            'OUTPUT',
            'ปริมาณผลิต',
            'production_mass',
            'LINE-ALL',
            'ผลผลิตรวมโรงงาน',
            't',
            ['PRODUCTION'],
          ],
          [
            'WASTEWATER',
            'COD',
            'ค่า COD',
            'concentration',
            'LAB-OUT',
            'จุดเก็บตัวอย่างน้ำทิ้ง',
            'mg_L',
            ['LAB'],
          ],
        ];
        for (const [category, param, name, dimension, asset, assetName, unit, kinds] of definitions) {
          await master('PARAMETER', String(param), String(name), { category, dimension, kinds });
          await master('ASSET', String(asset), String(assetName), {
            category,
            unit,
            mode: 'INTERVAL',
            boundary: 'INCLUDED',
            multiplier: 1,
            area: 'FACTORY',
          });
          if (param !== 'COD')
            await master('SCHEDULE', String(param) + '_DAILY', String(name) + ' รายวัน', {
              category,
              asset,
              parameter: param,
              kind: (kinds as string[])[0],
              frequency: 'DAILY',
              due: '23:59',
              calendar: 'OPERATING',
            });
        }
        await master('CALENDAR', 'OPERATING', 'ปฏิทินปฏิบัติการทุกวัน', {
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          holidays: [],
        });
        await master('CHECKLIST', 'VERIFY', 'ตรวจสอบก่อนปิดงาน', {
          items: ['ทำ Action ที่บังคับครบ', 'ตรวจหลักฐานและผลแก้ไข', 'ยืนยันการแยกผู้ทำกับผู้ตรวจ'],
        });
        await master('WORKFLOW', 'STANDARD', 'เจ้าหน้าที่ → หัวหน้า → ผู้ทำงาน → ผู้ตรวจอิสระ', {
          reviewers: ['es1', 'es2'],
          checklist: ['ทำ Action ที่บังคับครบ', 'ตรวจหลักฐานและผลแก้ไข', 'ยืนยันการแยกผู้ทำกับผู้ตรวจ'],
        });
        await master(
          'RULE',
          'WATER_TARGET',
          'แม่แบบเกณฑ์น้ำใช้ — ยังไม่กำหนดค่า',
          {
            parameter: 'WATER_USE',
            unit: 'm3',
            operator: '>',
            threshold: null,
            severity: 'HIGH',
            reference: 'ต้องยืนยันโดยองค์กร',
            regulatory: false,
          },
          'DRAFT',
        );
        await master(
          'RULE',
          'COD_LEGAL',
          'แม่แบบเกณฑ์ COD — ยังไม่ยืนยันกฎหมาย',
          {
            parameter: 'COD',
            unit: 'mg_L',
            operator: '>',
            threshold: null,
            severity: 'CRITICAL',
            reference: 'ต้องยืนยันกฎหมายและขอบเขตการใช้',
            regulatory: true,
          },
          'DRAFT',
        );
        if (site === 'site-a')
          await master('RULE', 'DEMO_WATER', 'Demo • เกณฑ์ฝึก flow น้ำใช้ 180 m³', {
            parameter: 'WATER_USE',
            kind: 'CONSUMED',
            unit: 'm3',
            operator: '>',
            threshold: 180,
            severity: 'HIGH',
            reference: 'Demo training fixture only — ไม่ใช่เกณฑ์ใช้งานจริง',
            regulatory: false,
            demo: true,
          });
      }
    });
  const today = localDate();
  const run = (user: string, action: string, input: Row) => execute(db, user, action, 'site-a', input, id());
  for (let day = 7; day >= 1; day--) {
    const date = new Date(Date.parse(today) - day * 86400000).toISOString().slice(0, 10);
    const values = [
      ['WATER', 'W-MAIN', 'WATER_USE', 'm3', 'CONSUMED', day === 1 ? 218 : 142 + day * 4],
      ['WASTEWATER', 'WW-OUT', 'WW_TREATED', 'm3', 'TREATED', 113 + day * 3],
      ['ENERGY', 'E-MAIN', 'ELECTRICITY', 'kWh', 'CONSUMED', 3200 + day * 81],
      ['WASTE', 'WASTE-GEN', 'WASTE_MASS', 'kg', 'GENERATED', 86 + day * 3],
      ['PRODUCTION', 'LINE-ALL', 'OUTPUT', 't', 'PRODUCTION', 24 + day],
    ];
    for (const [category, asset_code, parameter_code, unit, kind, value] of values) {
      let r = (
        await db.query<Row>(
          'SELECT * FROM record_versions WHERE site_id=$1 AND asset_code=$2 AND parameter_code=$3 AND event_date=$4::date ORDER BY version DESC LIMIT 1',
          ['site-a', asset_code, parameter_code, date],
        )
      ).rows[0];
      if (!r)
        r = await run('eo', 'record.create', {
          category,
          asset_code,
          parameter_code,
          unit,
          kind,
          value,
          event_date: date,
          source: 'MANUAL',
          note: 'Demo • ข้อมูลจำลองสำหรับทดสอบ',
        });
      if (r.status === 'DRAFT') r = await run('eo', 'record.submit', { id: r.id, version: r.lock_version });
      if (r.status === 'SUBMITTED') await run('es1', 'record.approve', { id: r.id, version: r.lock_version });
    }
  }
  if (
    !(
      await db.query(
        'SELECT 1 FROM record_versions WHERE site_id=$1 AND asset_code=$2 AND event_date=$3::date',
        ['site-a', 'W-MAIN', today],
      )
    ).rows.length
  ) {
    const r = await run('eo', 'record.create', {
      category: 'WATER',
      asset_code: 'W-MAIN',
      parameter_code: 'WATER_USE',
      unit: 'm3',
      kind: 'CONSUMED',
      value: 164,
      event_date: today,
      source: 'MANUAL',
      note: 'Demo • รายการรอหัวหน้าตรวจ',
    });
    await run('eo', 'record.submit', { id: r.id, version: r.lock_version });
  }
  const alerts = (
    await db.query<Row>('SELECT * FROM alerts WHERE site_id=$1 ORDER BY created_at DESC', ['site-a'])
  ).rows;
  if (alerts[0] && !(await db.query('SELECT 1 FROM issues WHERE alert_id=$1', [alerts[0].id])).rows.length) {
    const issue = await run('eo', 'issue.create', {
      title: 'Demo • ตรวจสอบปริมาณน้ำใช้สูงกว่าเกณฑ์ฝึก',
      description: 'พบค่าปริมาณน้ำใช้เกินเกณฑ์ Demo ต้องตรวจสาเหตุและหลักฐานก่อนสรุป',
      category: 'WATER',
      severity: 'HIGH',
      alert_id: alerts[0].id,
    });
    const due = new Date(Date.parse(today) + 3 * 86400000).toISOString().slice(0, 10);
    await run('es1', 'issue.assign', {
      id: issue.id,
      version: issue.version,
      owner_id: 'owner',
      verifier_id: 'es2',
      due_date: due,
    });
  }
  await seedDashboardFixtures(db);
  if (options.monthly !== false) await seedSeptember(db);
  return { seeded: true };
}
