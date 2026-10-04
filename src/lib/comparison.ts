import type { Row } from './core';
import { dateString, dateRange } from './core';
export const comparisonPairs = [
  {
    id: 'water-wastewater',
    title: 'น้ำใช้ × น้ำเสียที่บำบัด',
    x: 'WATER',
    y: 'WASTEWATER',
    question: 'ปริมาณน้ำเสียเคลื่อนไหวสอดคล้องกับน้ำใช้หรือไม่?',
    caveat:
      'ปริมาณบำบัดไม่เท่ากับปริมาณปล่อยให้นิคมฯ อัตโนมัติ; ส่วนต่างอาจเป็นน้ำในผลิตภัณฑ์ ระเหย หรือ timing ของระบบ',
  },
  {
    id: 'wastewater-production',
    title: 'น้ำเสียที่บำบัด × ผลผลิต',
    x: 'PRODUCTION',
    y: 'WASTEWATER',
    question: 'ปริมาณบำบัดต่อหน่วยผลิตเปลี่ยนอย่างไร?',
    caveat: 'ปริมาณน้ำเสียที่บำบัดไม่ใช่ปริมาณปล่อยให้นิคมฯ; ไม่ใช้ความเข้มข้น pH/BOD/COD หารด้วยผลผลิต',
  },
  {
    id: 'water-production',
    title: 'น้ำใช้ × ผลผลิต',
    x: 'PRODUCTION',
    y: 'WATER',
    question: 'น้ำใช้เพิ่มเพราะผลผลิตเพิ่ม หรืออัตราต่อหน่วยเปลี่ยน?',
    caveat: 'พิจารณา product mix, cleaning และวันหยุดร่วมด้วย',
  },
  {
    id: 'energy-production',
    title: 'พลังงาน × ผลผลิต',
    x: 'PRODUCTION',
    y: 'ENERGY',
    question: 'พลังงานสัมพันธ์กับผลผลิต และมีวันใช้พลังงานสูงแต่ผลิตต่ำหรือไม่?',
    caveat: 'กราฟ kWh แสดงปริมาณพลังงาน; ไม่ใช่ peak demand หรือค่าไฟ',
  },
  {
    id: 'waste-production',
    title: 'ขยะเกิดขึ้น × ผลผลิต',
    x: 'PRODUCTION',
    y: 'WASTE',
    question: 'ขยะต่อหน่วยผลิตเปลี่ยนแปลงอย่างไร?',
    caveat: 'ดูเฉพาะขยะเกิดขึ้น; การส่งไปจัดการไม่นับเป็น generation ซ้ำ',
  },
];
export function pairStatistics(rows: Row[]) {
  const valid = rows.filter((r) => r.x !== null && r.y !== null && r.complete);
  let correlation: number | null = null;
  if (valid.length >= 3) {
    const mx = valid.reduce((s, r) => s + r.x, 0) / valid.length,
      my = valid.reduce((s, r) => s + r.y, 0) / valid.length;
    const xx = valid.reduce((s, r) => s + (r.x - mx) ** 2, 0),
      yy = valid.reduce((s, r) => s + (r.y - my) ** 2, 0);
    if (xx > 0 && yy > 0)
      correlation = Math.max(
        -1,
        Math.min(1, valid.reduce((s, r) => s + (r.x - mx) * (r.y - my), 0) / Math.sqrt(xx * yy)),
      );
  }
  const totalX = valid.length ? valid.reduce((s, r) => s + r.x, 0) : null,
    totalY = valid.length ? valid.reduce((s, r) => s + r.y, 0) : null;
  return {
    matched: valid.length,
    excluded: rows.length - valid.length,
    correlation,
    totalX,
    totalY,
    ratio: totalX !== null && totalX > 0 ? totalY! / totalX : null,
  };
}
export function comparisonData(
  analytics: Row,
  productionRows: Row[],
  from: string,
  to: string,
  targets: Row[] = [],
) {
  const days = dateRange(from, to);
  const productionUnit = analytics.production.unit;
  const production = days.map((date) => {
    const rows = productionRows.filter((r) => dateString(r.event_date) === date);
    const bases = new Set(rows.map((r) => r.config_snapshot.unit?.config.base));
    const slots = analytics.production.coverage.slots.filter((s: Row) => s.date === date);
    return {
      date,
      value:
        rows.length && bases.size === 1 && bases.has(productionUnit)
          ? rows.reduce((s, r) => s + Number(r.value) * Number(r.config_snapshot.unit?.config.factor ?? 1), 0)
          : null,
      complete: slots.length > 0 && slots.every((s: Row) => s.approved),
      sources: rows.map((r) => r.id),
    };
  });
  const series = (category: string) =>
    category === 'PRODUCTION'
      ? production
      : analytics.kpis
          .find((k: Row) => k.category === category)
          .daily.map((d: Row) => {
            return { ...d, complete: d.complete, sources: d.sources || [] };
          });
  const unit = (category: string) =>
    category === 'PRODUCTION'
      ? productionUnit || 'ยังไม่กำหนด'
      : analytics.kpis.find((k: Row) => k.category === category).unit;
  return comparisonPairs.map((pair) => {
    const xs = series(pair.x),
      ys = series(pair.y);
    const rows = days.map((date, i) => ({
      date,
      x: xs[i].value,
      y: ys[i].value,
      complete: xs[i].complete && ys[i].complete,
      sources: [...xs[i].sources, ...ys[i].sources],
      xSources: xs[i].sources,
      ySources: ys[i].sources,
    }));
    const dailyIntensity =
      pair.x === 'PRODUCTION'
        ? rows.map((r) => {
            const target = targets.find(
              (t) =>
                t.config.category === pair.y &&
                t.config.production_unit === productionUnit &&
                dateString(t.effective_from) <= r.date &&
                (!t.effective_to || dateString(t.effective_to) >= r.date),
            );
            const value = r.complete && r.x !== null && r.x > 0 && r.y !== null ? r.y / r.x : null;
            return {
              ...r,
              value,
              limit: target ? Number(target.config.limit) : null,
              target: target || null,
              aboveTarget: value !== null && target ? value > Number(target.config.limit) : null,
              zeroProduction: r.complete && r.x === 0,
            };
          })
        : [];
    const ordered = dailyIntensity.filter((r) => r.value !== null).sort((a, b) => b.value! - a.value!);
    const stats = pairStatistics(rows);
    const targetIds = new Set(
      dailyIntensity
        .filter((r) => r.complete && r.x !== null && r.y !== null)
        .map((r) => r.target?.id || null),
    );
    const periodTarget =
      targetIds.size === 1 && !targetIds.has(null) ? dailyIntensity.find((r) => r.target)?.target : null;
    return {
      ...pair,
      xUnit: unit(pair.x),
      yUnit: unit(pair.y),
      rows,
      ...stats,
      dailyIntensity,
      topDays: ordered.slice(0, 3),
      idleDays: dailyIntensity.filter((r) => r.zeroProduction && r.y !== null && r.y > 0),
      aboveTargetDays: dailyIntensity.filter((r) => r.aboveTarget === true).length,
      targetEvaluatedDays: dailyIntensity.filter((r) => r.aboveTarget !== null).length,
      periodTarget: periodTarget || null,
      targetStatus:
        periodTarget && stats.ratio !== null
          ? stats.ratio > Number(periodTarget.config.limit)
            ? 'ABOVE'
            : 'WITHIN'
          : targetIds.size > 1
            ? 'MIXED'
            : 'UNCONFIGURED',
      formula:
        'Σ resource ÷ Σ production ของวันครบคู่ (รวมภาระในวันผลิตเป็นศูนย์); รายวันไม่คำนวณเมื่อ production = 0',
    };
  });
}
