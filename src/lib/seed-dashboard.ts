import type { DB } from './db';
import { id, insert, localDate, type Row } from './core';
import { execute } from './service';
import { ieatParameters, ieatReference } from './ieat-reference';
export async function seedDashboardFixtures(db: DB) {
  for (const site of ['site-a', 'site-b'])
    await db.transaction(async (tx) => {
      const add = async (kind: string, code: string, name: string, config: Row, status = 'ACTIVE') => {
        if (
          (
            await tx.query('SELECT 1 FROM master_versions WHERE site_id=$1 AND kind=$2 AND code=$3', [
              site,
              kind,
              code,
            ])
          ).rows.length
        )
          return;
        await insert(tx, 'master_versions', {
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
      };
      await add('UNIT', 'degC', 'องศาเซลเซียส', { dimension: 'temperature', factor: 1, base: 'degC' });
      await add('ASSET', 'LAB-IEAT', 'Demo • จุดปล่อยเข้าระบบบำบัดส่วนกลาง', {
        category: 'WASTEWATER',
        unit: 'mg_L',
        mode: 'INTERVAL',
        boundary: 'EXCLUDED',
        measurement_type: 'LAB',
        discharge_context: 'IEAT_CENTRAL',
        area: 'FACTORY',
      });
      for (const p of ieatParameters) {
        await add('PARAMETER', p.code, p.name, {
          category: 'WASTEWATER',
          dimension: p.dimension,
          kinds: ['LAB'],
        });
        await add(
          'RULE',
          'IEAT76_' + p.code,
          'รอยืนยัน • กนอ. ' + p.name,
          {
            parameter: p.code,
            asset: 'LAB-IEAT',
            kind: 'LAB',
            unit: p.unit,
            operator: p.lower === null ? '>' : 'between',
            threshold: p.lower === null ? p.upper : p.lower,
            upper: p.lower === null ? undefined : p.upper,
            severity: 'HIGH',
            reference: ieatReference.title,
            reference_url: ieatReference.url,
            regulatory: true,
            discharge_context: 'IEAT_CENTRAL',
            applicability_confirmed: false,
          },
          'DRAFT',
        );
      }
    });
  const values: Record<string, number[]> = {
    PH: [7.1, 7.4, 7.2, 6.9, 7.6, 7.3, 7.2],
    BOD: [215, 230, 245, 270, 260, 235, 220],
    COD: [420, 450, 470, 540, 520, 460, 445],
    TSS: [72, 80, 85, 105, 94, 82, 77],
    TDS: [920, 1050, 1080, 1160, 1120, 1070, 1030],
    OIL_GREASE: [3.2, 3.6, 4.1, 4.7, 4.4, 3.8, 3.5],
    TKN: [24, 28, 31, 36, 34, 30, 27],
    TEMPERATURE: [30, 31, 31.5, 32, 31, 30.5, 30],
  };
  const today = localDate();
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.parse(today) - (7 - i) * 86400000).toISOString().slice(0, 10);
    for (const p of ieatParameters) {
      if (
        (
          await db.query(
            "SELECT 1 FROM record_versions WHERE site_id='site-a' AND asset_code='LAB-IEAT' AND parameter_code=$1 AND event_date=$2::date",
            [p.code, date],
          )
        ).rows.length
      )
        continue;
      let record = await execute(
        db,
        'eo',
        'record.create',
        'site-a',
        {
          category: 'WASTEWATER',
          asset_code: 'LAB-IEAT',
          parameter_code: p.code,
          event_date: date,
          value: values[p.code][i],
          unit: p.unit,
          kind: 'LAB',
          source: 'LAB',
          source_ref: 'DEMO-IEAT-' + date,
          note: 'Demo • ข้อมูลจำลองคุณภาพน้ำ ไม่ใช่ผลตรวจของโรงงาน',
          payload: { received_date: date },
        },
        id(),
      );
      record = await execute(
        db,
        'eo',
        'record.submit',
        'site-a',
        { id: record.id, version: record.lock_version },
        id(),
      );
      await execute(
        db,
        'es1',
        'record.approve',
        'site-a',
        { id: record.id, version: record.lock_version },
        id(),
      );
    }
  }
}
