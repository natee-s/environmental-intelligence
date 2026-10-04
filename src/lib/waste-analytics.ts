import { dateString, type Row } from './core';
export const wasteCategories = [
  { code: 'RECYCLE', name: 'ขยะ Recycle (ไม่อันตราย)', color: '#10a89a' },
  { code: 'HAZARDOUS', name: 'ขยะอันตราย', color: '#df8161' },
  { code: 'GENERAL', name: 'ขยะทั่วไป', color: '#5c92d9' },
  { code: 'UNKNOWN', name: 'ยังไม่ทราบประเภท', color: '#9ba9bb' },
];
function classification(r: Row) {
  const c = r.config_snapshot?.wasteType?.config;
  if (!c) return 'UNKNOWN';
  if (c.hazardous === true || c.classification === 'HAZARDOUS') return 'HAZARDOUS';
  if (c.recyclable === true || c.classification === 'RECYCLE') return 'RECYCLE';
  return c.classification === 'GENERAL' ? 'GENERAL' : 'UNKNOWN';
}
// Only INCLUDED generation is authoritative. Children explain their parent, never add a second total.
export function wasteComposition(values: Row[], days: string[]) {
  const rows = values.filter((v) => v.record.category === 'WASTE' && v.record.kind === 'GENERATED');
  const daily: Row[] = days.map((date) => {
    const entries = rows.filter((v) => dateString(v.record.event_date) === date);
    const parents = entries.filter((v) => v.record.config_snapshot.asset?.config.boundary === 'INCLUDED');
    const known = parents.filter((v) => v.value !== null);
    const buckets: Record<string, number | null> = Object.fromEntries(
      wasteCategories.map((c) => [c.code, null]),
    );
    const sources: Record<string, string[]> = Object.fromEntries(wasteCategories.map((c) => [c.code, []]));
    const warnings: string[] = [];
    const add = (code: string, value: number, ids: string[]) => {
      buckets[code] = (buckets[code] ?? 0) + value;
      sources[code].push(...ids);
    };
    for (const parent of known) {
      const direct = classification(parent.record);
      if (direct !== 'UNKNOWN') {
        add(direct, parent.value, parent.sources);
        continue;
      }
      const children = entries.filter(
        (v) =>
          v.record.config_snapshot.asset?.config.boundary === 'BREAKDOWN' &&
          v.record.config_snapshot.asset?.config.parent === parent.record.asset_code &&
          v.value !== null,
      );
      const sum = children.reduce((n, v) => n + v.value, 0);
      if (sum > parent.value + 0.00001) {
        warnings.push(
          `จุดย่อย ${parent.record.asset_code} รวมมากกว่าจุดหลักใน ${date}; ไม่ใช้สัดส่วนที่ขัดกัน`,
        );
        add('UNKNOWN', parent.value, [...parent.sources, ...children.flatMap((v) => v.sources)]);
        continue;
      }
      for (const child of children) add(classification(child.record), child.value, child.sources);
      const remainder = Math.abs(parent.value - sum) <= 0.0000001 ? 0 : Math.max(0, parent.value - sum);
      if (!children.length || remainder > 0) add('UNKNOWN', remainder, parent.sources);
    }
    const total = known.length ? known.reduce((n, v) => n + v.value, 0) : null;
    return {
      date,
      total,
      ...buckets,
      sources,
      warnings,
      hasUnknown: (buckets.UNKNOWN ?? 0) > 0,
      reconciled:
        total !== null && known.length === parents.length && !(buckets.UNKNOWN ?? 0) && !warnings.length,
    };
  });
  const total = daily.some((d) => d.total !== null) ? daily.reduce((n, d) => n + (d.total ?? 0), 0) : null;
  return {
    unit: 'kg',
    total,
    daily,
    categories: wasteCategories.map((c) => {
      const observed = daily.filter((d) => d[c.code] !== null);
      const value = observed.length ? observed.reduce((n, d) => n + Number(d[c.code]), 0) : null;
      return {
        ...c,
        value,
        share: value !== null && total !== null && total > 0 ? (value / total) * 100 : null,
        sources: [...new Set(daily.flatMap((d) => d.sources[c.code]))],
      };
    }),
    warnings: daily.flatMap((d) => d.warnings),
    classifiedDays: daily.filter((d) => d.reconciled).length,
    observedDays: daily.filter((d) => d.total !== null).length,
    formula:
      'แบ่ง INCLUDED GENERATED เป็นประเภทจาก snapshot; BREAKDOWN ใช้กระทบยอดแม่วันเดียวกัน ไม่บวกเป็น generation ซ้ำ; ส่วนที่ระบุไม่ได้เป็น UNKNOWN',
  };
}
