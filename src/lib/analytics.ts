import type { DB } from './db';
import { comparisonData } from './comparison';
import { wasteComposition } from './waste-analytics';
import { ieatParameters, ieatReference } from './ieat-reference';
import {
  type Actor,
  type Row,
  activeMasters,
  dateRange,
  dateString,
  localDate,
  one,
  id,
  insert,
  event,
  notify,
  supervisors,
} from './core';

export function normalized(
  r: Row,
  history: Row[],
  resets: Row[] = [],
): { value: number | null; reason: string; sources: string[] } {
  const factor = Number(r.config_snapshot.unit?.config.factor ?? 1);
  const sources = [r.id];
  if (r.value === null) return { value: null, reason: 'ยังไม่มีค่าที่วัด', sources };
  if (r.qualifier) return { value: null, reason: 'ผลแล็บแบบช่วง ไม่แทนค่าด้วยขอบเขต', sources };
  let value = Number(r.value) * factor;
  if (r.config_snapshot.asset?.config.mode === 'CUMULATIVE') {
    const prev = history
      .filter(
        (p) =>
          p.asset_code === r.asset_code &&
          p.parameter_code === r.parameter_code &&
          p.kind === r.kind &&
          dateString(p.event_date) < dateString(r.event_date),
      )
      .sort((a, b) => dateString(b.event_date).localeCompare(dateString(a.event_date)))[0];
    if (!prev) return { value: null, reason: 'ไม่มี approved baseline สำหรับเลขสะสม', sources };
    sources.push(prev.id);
    value -= Number(prev.value) * Number(prev.config_snapshot.unit?.config.factor ?? 1);
    if (value < 0) {
      const reset = resets.find(
        (x) => x.config.asset === r.asset_code && dateString(x.effective_from) === dateString(r.event_date),
      );
      if (!reset) return { value: null, reason: 'เลขสะสมลดลง ต้องมี reset/rollover ที่อนุมัติ', sources };
      value = Number(reset.config.consumption);
    }
    if (Date.parse(dateString(r.event_date)) - Date.parse(dateString(prev.event_date)) !== 86400000)
      return { value: null, reason: 'baseline ไม่ตรงช่วงรายวัน ต้องตรวจช่วงมิเตอร์', sources };
  }
  return { value: value * Number(r.config_snapshot.asset?.config.multiplier ?? 1), reason: '', sources };
}
export function evaluateValue(r: Row, rule: Row, value: number | null) {
  if (r.status !== 'APPROVED') return 'PENDING';
  if (!rule) return 'NOT_EVALUATED';
  if (value === null || r.qualifier) return 'INDETERMINATE';
  const threshold = Number(rule.config.threshold);
  const upper = Number(rule.config.upper);
  const op = rule.config.operator;
  const exceed =
    op === '>'
      ? value > threshold
      : op === '>='
        ? value >= threshold
        : op === '<'
          ? value < threshold
          : op === '<='
            ? value <= threshold
            : value < threshold || value > upper;
  return exceed ? 'EXCEED' : 'PASS';
}
export async function qualityFor(db: DB, site: string, r: Row) {
  const rules = await activeMasters(db, site, 'RULE', dateString(r.event_date));
  const units = await activeMasters(db, site, 'UNIT', dateString(r.event_date));
  const rule = rules.find(
    (x) =>
      x.config.parameter === r.parameter_code &&
      (!x.config.asset || x.config.asset === r.asset_code) &&
      (!x.config.kind || x.config.kind === r.kind) &&
      (!x.config.discharge_context ||
        x.config.discharge_context === r.config_snapshot.asset?.config.discharge_context) &&
      units.some(
        (u) =>
          u.code === x.config.unit &&
          u.config.dimension === r.config_snapshot.unit?.config.dimension &&
          u.config.base === r.config_snapshot.unit?.config.base,
      ),
  );
  const unit = units.find((u) => u.code === rule?.config.unit);
  const value =
    r.value === null || r.qualifier || !unit
      ? null
      : (Number(r.value) * Number(r.config_snapshot.unit.config.factor)) / Number(unit.config.factor);
  return {
    status: rule ? evaluateValue(r, rule, value) : 'NOT_EVALUATED',
    rule: rule || null,
  };
}
export async function coverage(
  db: DB,
  site: string,
  from: string,
  to: string,
  records: Row[],
  category?: string,
) {
  const days = dateRange(from, to);
  const configs = (
    await db.query<Row>(
      "SELECT * FROM master_versions WHERE site_id=$1 AND approved_by IS NOT NULL AND kind IN('SCHEDULE','EXEMPTION','CALENDAR') AND effective_from<=$3::date AND (effective_to IS NULL OR effective_to>=$2::date) ORDER BY version DESC",
      [site, from, to],
    )
  ).rows;
  const slots: Row[] = [];
  for (const day of days) {
    const valid = configs.filter(
      (c) => dateString(c.effective_from) <= day && (!c.effective_to || dateString(c.effective_to) >= day),
    );
    const schedules = valid.filter(
      (x) => x.kind === 'SCHEDULE' && (!category || x.config.category === category),
    );
    for (const s of schedules) {
      if (slots.some((x) => x.date === day && x.schedule === s.code)) continue;
      if (s.config.frequency === 'WEEKLY' && new Date(day).getUTCDay() !== s.config.weekday) continue;
      const cal = valid.find((c) => c.kind === 'CALENDAR' && c.code === s.config.calendar);
      if (
        cal &&
        (cal.config.holidays?.includes(day) ||
          (cal.config.weekdays && !cal.config.weekdays.includes(new Date(day).getUTCDay())))
      )
        continue;
      if (valid.some((x) => x.kind === 'EXEMPTION' && x.config.schedule === s.code)) continue;
      const matching = records.filter(
        (r) =>
          dateString(r.event_date) === day &&
          r.asset_code === s.config.asset &&
          r.parameter_code === s.config.parameter &&
          (!s.config.kind || r.kind === s.config.kind),
      );
      const received = matching.some(
        (r) => ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(r.status) && r.value !== null,
      );
      const approved = matching.some((r) => r.status === 'APPROVED');
      slots.push({
        date: day,
        schedule: s.code,
        category: s.config.category,
        asset: s.config.asset,
        parameter: s.config.parameter,
        received,
        approved,
        due: s.config.due || '23:59',
      });
    }
  }
  const expected = slots.length,
    received = slots.filter((x) => x.received).length,
    approved = slots.filter((x) => x.approved).length;
  return {
    expected,
    received,
    approved,
    receivedPercent: expected ? (received / expected) * 100 : null,
    approvedPercent: expected ? (approved / expected) * 100 : null,
    missing: slots.filter((x) => !x.received),
    slots,
    status: expected ? (approved === expected ? 'COMPLETE' : 'PARTIAL') : 'UNCONFIGURED',
  };
}
const kpiDefs = [
  { category: 'WATER', code: 'KPI-W01', name: 'ปริมาณน้ำใช้', unit: 'm³', kind: 'CONSUMED' },
  { category: 'WASTEWATER', code: 'KPI-WW01', name: 'น้ำเสียที่บำบัด', unit: 'm³', kind: 'TREATED' },
  { category: 'ENERGY', code: 'KPI-E01', name: 'พลังงานไฟฟ้า', unit: 'kWh', kind: 'CONSUMED' },
  { category: 'WASTE', code: 'KPI-WS01', name: 'ขยะที่เกิดขึ้น', unit: 'kg', kind: 'GENERATED' },
];
export async function analytics(db: DB, site: string, from: string, to: string) {
  const days = dateRange(from, to);
  const history = (
    await db.query<Row>(
      "SELECT * FROM record_versions WHERE site_id=$1 AND event_date<=$2::date AND status='APPROVED' ORDER BY event_date",
      [site, to],
    )
  ).rows;
  const all = (
    await db.query<Row>(
      'SELECT * FROM record_versions WHERE site_id=$1 AND event_date BETWEEN $2::date AND $3::date',
      [site, from, to],
    )
  ).rows;
  const approved = history.filter((r) => dateString(r.event_date) >= from);
  const resets = (
    await db.query<Row>(
      "SELECT * FROM master_versions WHERE site_id=$1 AND kind='COUNTER_RESET' AND approved_by IS NOT NULL",
      [site],
    )
  ).rows;
  const prod = approved.filter((r) => r.category === 'PRODUCTION');
  const pc = await coverage(db, site, from, to, all, 'PRODUCTION');
  const productionUnits = new Set(prod.map((r) => r.config_snapshot.unit?.config.base || r.unit));
  const production =
    prod.length && productionUnits.size === 1
      ? prod.reduce((n, r) => n + Number(r.value) * Number(r.config_snapshot.unit?.config.factor ?? 1), 0)
      : null;
  const baselineTo = new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10);
  const baselineFrom = new Date(Date.parse(from) - days.length * 86400000).toISOString().slice(0, 10);
  const kpis = [];
  for (const def of kpiDefs) {
    const rows = approved.filter(
      (r) =>
        r.category === def.category &&
        r.kind === def.kind &&
        r.config_snapshot.asset?.config.boundary === 'INCLUDED',
    );
    const values = rows.map((r) => ({ ...normalized(r, history, resets), record: r }));
    const known = values.filter((x) => x.value !== null);
    const value = known.length ? known.reduce((s, v) => s + v.value!, 0) : null;
    const c = await coverage(db, site, from, to, all, def.category);
    const related = approved.filter((r) => r.category === def.category && r.kind === def.kind);
    const assetCodes = Array.from(new Set(related.map((r) => r.asset_code)));
    const breakdown = assetCodes.map((asset) => {
      const set = related.filter((r) => r.asset_code === asset);
      const amounts = set.map((r) => normalized(r, history, resets)).filter((v) => v.value !== null);
      return {
        asset,
        name: set[0].config_snapshot.asset?.name,
        boundary: set[0].config_snapshot.asset?.config.boundary,
        parent: set[0].config_snapshot.asset?.config.parent || null,
        value: amounts.length ? amounts.reduce((n, v) => n + v.value!, 0) : null,
        sources: set.map((r) => r.id),
      };
    });
    const fullDays = days.filter((day) => {
      const slots = c.slots.filter((s) => s.date === day);
      return (
        slots.length > 0 &&
        slots.every((s) => s.approved) &&
        values.filter((v) => dateString(v.record.event_date) === day).every((v) => v.value !== null)
      );
    });
    const observedValues = known.filter((v) => fullDays.includes(dateString(v.record.event_date)));
    const previous = history
      .filter(
        (r) =>
          r.category === def.category &&
          r.kind === def.kind &&
          r.config_snapshot.asset?.config.boundary === 'INCLUDED' &&
          dateString(r.event_date) >= baselineFrom &&
          dateString(r.event_date) <= baselineTo,
      )
      .map((r) => normalized(r, history, resets))
      .filter((r) => r.value !== null);
    const baseline = previous.length ? previous.reduce((s, r) => s + r.value!, 0) : null;
    const matched =
      pc.status === 'COMPLETE' &&
      c.status === 'COMPLETE' &&
      values.every((x) => x.value !== null) &&
      days
        .filter((d) => rows.some((r) => dateString(r.event_date) === d))
        .every((d) => prod.some((r) => dateString(r.event_date) === d));
    kpis.push({
      ...def,
      value,
      formula: `Σ current APPROVED ${def.kind}, boundary=INCLUDED; สูตรรุ่น P1.1`,
      coverage: c,
      breakdown,
      observedDays: fullDays.length,
      observedAverage: fullDays.length
        ? observedValues.reduce((n, v) => n + v.value!, 0) / fullDays.length
        : null,
      reconciliation: breakdown
        .filter((b) => b.boundary === 'INCLUDED')
        .map((parent) => {
          const children = breakdown.filter(
            (child) => child.parent === parent.asset && child.boundary === 'BREAKDOWN',
          );
          const complete = children.length > 0 && children.every((c) => c.value !== null);
          return {
            asset: parent.asset,
            difference:
              complete && parent.value !== null
                ? parent.value - children.reduce((n, c) => n + c.value!, 0)
                : null,
          };
        }),
      status:
        value === null
          ? 'NO_DATA'
          : c.status === 'COMPLETE' && known.length === rows.length
            ? 'COMPLETE'
            : 'PARTIAL',
      sources: Array.from(new Set(values.flatMap((v) => v.sources))),
      warnings: values.filter((v) => v.reason).map((v) => ({ id: v.record.id, reason: v.reason })),
      baseline,
      baselineFrom,
      baselineTo,
      delta: value !== null && baseline !== null ? value - baseline : null,
      change:
        value !== null && baseline !== null && baseline !== 0 ? ((value - baseline) / baseline) * 100 : null,
      intensity:
        value !== null && production !== null && production > 0 && matched ? value / production : null,
      production,
      productionUnit: Array.from(productionUnits)[0] || 't',
      productionSources: prod.map((r) => r.id),
      daily: days.map((date) => {
        const v = known.filter((x) => dateString(x.record.event_date) === date);
        const slots = c.slots.filter((s: Row) => s.date === date);
        return {
          date,
          value: v.length ? v.reduce((s, r) => s + r.value!, 0) : null,
          sources: Array.from(new Set(v.flatMap((x) => x.sources))),
          complete:
            slots.length > 0 &&
            slots.every((s: Row) => s.approved) &&
            values.filter((x) => dateString(x.record.event_date) === date).every((x) => x.value !== null),
        };
      }),
    });
  }
  const quality: Row[] = [];
  for (const r of approved.filter((r) => r.kind === 'LAB'))
    quality.push({
      id: r.id,
      parameter: r.parameter_code,
      category: r.category,
      date: dateString(r.event_date),
      raw: r.raw_value || r.value,
      asset: r.asset_code,
      assetName: r.config_snapshot.asset?.name,
      context: r.config_snapshot.asset?.config.discharge_context || null,
      sample: r.source_ref,
      unit: r.config_snapshot.unit?.config.base || r.unit,
      value:
        r.value === null || r.qualifier
          ? null
          : Number(r.value) * Number(r.config_snapshot.unit?.config.factor ?? 1),
      qualifier: r.qualifier || null,
      ...(await qualityFor(db, site, r)),
    });
  const pass = quality.filter((x) => x.status === 'PASS').length;
  const exceed = quality.filter((x) => x.status === 'EXCEED').length;
  const handled = approved.filter((r) => r.category === 'WASTE' && ['RECYCLED', 'DISPOSED'].includes(r.kind));
  const seen = new Set<string>();
  const uniqueHandled = handled.filter((r) => {
    const key = `${r.source_ref}|${r.asset_code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ht = uniqueHandled.reduce(
    (s, r) => s + Number(r.value) * Number(r.config_snapshot.unit?.config.factor ?? 1),
    0,
  );
  const recycled = uniqueHandled
    .filter((r) => r.kind === 'RECYCLED')
    .reduce((s, r) => s + Number(r.value) * Number(r.config_snapshot.unit?.config.factor ?? 1), 0);
  const issues = (
    await db.query<Row>('SELECT * FROM issues WHERE site_id=$1 ORDER BY created_at DESC', [site])
  ).rows;
  const tz = (await one(db, 'SELECT timezone FROM sites WHERE id=$1', [site])).timezone;
  const today = localDate(tz);
  const active = issues.filter((i) => !['CLOSED', 'CANCELLED'].includes(i.status));
  const closedEvents = (
    await db.query<Row>(
      "SELECT DISTINCT entity_id FROM events WHERE site_id=$1 AND entity_type='issue' AND action='issue.close' AND (created_at AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date",
      [site, from, to, tz],
    )
  ).rows;
  const result = {
    site,
    from,
    to,
    timezone: tz,
    generatedAt: new Date().toISOString(),
    freshness:
      approved
        .map((r) => r.approved_at)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
        .at(-1) || null,
    kpis,
    production: {
      value: production,
      unit: Array.from(productionUnits)[0] || null,
      coverage: pc,
      sources: prod.map((r) => r.id),
    },
    quality,
    passRate: pass + exceed ? (pass / (pass + exceed)) * 100 : null,
    recyclingRate: ht > 0 ? (recycled / ht) * 100 : null,
    handled: ht || null,
    peakDemand: approved.some((r) => r.kind === 'DEMAND')
      ? Math.max(...approved.filter((r) => r.kind === 'DEMAND').map((r) => Number(r.value)))
      : null,
    issues: {
      active: active.length,
      overdue: active.filter((i) => i.due_date && dateString(i.due_date) < today).length,
      waiting: active.filter((i) => i.status === 'WAITING_VERIFICATION').length,
      critical: active.filter((i) => i.severity === 'CRITICAL').length,
      unassigned: active.filter((i) => !i.owner_id).length,
      closedInPeriod: closedEvents.length,
      asOf: new Date().toISOString(),
    },
    attention: active
      .sort(
        (a, b) =>
          ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].indexOf(a.severity) -
          ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].indexOf(b.severity),
      )
      .slice(0, 6),
  };
  const targets = (
    await db.query<Row>(
      "SELECT * FROM master_versions WHERE site_id=$1 AND kind='INTENSITY_TARGET' AND approved_by IS NOT NULL AND effective_from<=$3::date AND (effective_to IS NULL OR effective_to>=$2::date) ORDER BY version DESC,created_at DESC",
      [site, from, to],
    )
  ).rows;
  return {
    ...result,
    comparison: comparisonData(result, prod, from, to, targets),
    wasteComposition: wasteComposition(
      approved
        .filter((r) => r.category === 'WASTE' && r.kind === 'GENERATED')
        .map((r) => ({ ...normalized(r, history, resets), record: r })),
      days,
    ),
    ieatReference,
    ieatPlots: ieatParameters.map((p) => ({
      ...p,
      unit: p.unit === 'mg_L' ? 'mg/L' : p.unit === 'degC' ? '°C' : p.unit,
      samples: quality
        .filter((q) => q.category === 'WASTEWATER' && q.parameter === p.code && q.context === 'IEAT_CENTRAL')
        .sort((a, b) => a.date.localeCompare(b.date)),
    })),
  };
}
export async function evaluateRules(db: DB, a: Actor, site: string, recordId: string) {
  const r = await one(db, "SELECT * FROM record_versions WHERE id=$1 AND site_id=$2 AND status='APPROVED'", [
    recordId,
    site,
  ]);
  const rules = await activeMasters(db, site, 'RULE', dateString(r.event_date));
  const units = await activeMasters(db, site, 'UNIT', dateString(r.event_date));
  const history = (
    await db.query<Row>(
      "SELECT * FROM record_versions WHERE site_id=$1 AND status='APPROVED' ORDER BY event_date",
      [site],
    )
  ).rows;
  const resets = await activeMasters(db, site, 'COUNTER_RESET', dateString(r.event_date));
  for (const rule of rules.filter(
    (x) =>
      x.config.parameter === r.parameter_code &&
      (!x.config.asset || x.config.asset === r.asset_code) &&
      (!x.config.kind || x.config.kind === r.kind) &&
      (!x.config.discharge_context ||
        x.config.discharge_context === r.config_snapshot.asset?.config.discharge_context) &&
      units.some(
        (u) =>
          u.code === x.config.unit &&
          u.config.dimension === r.config_snapshot.unit?.config.dimension &&
          u.config.base === r.config_snapshot.unit?.config.base,
      ),
  )) {
    const amount = normalized(r, history, resets).value;
    const ruleUnit = units.find((u) => u.code === rule.config.unit)!;
    const val =
      r.kind === 'LAB'
        ? r.qualifier
          ? null
          : (Number(r.value) * Number(r.config_snapshot.unit?.config.factor ?? 1)) /
            Number(ruleUnit.config.factor)
        : amount === null
          ? null
          : amount / Number(ruleUnit.config.factor);
    const state = evaluateValue(r, rule, val);
    const key = [site, rule.id, r.asset_code, r.parameter_code].join('|');
    const evaluation = await db.query(
      'INSERT INTO rule_evaluations(id,site_id,rule_id,record_id,result,value) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(rule_id,record_id) DO NOTHING RETURNING id',
      [id(), site, rule.id, r.id, state, val],
    );
    if (!evaluation.rows.length) continue;
    if (state === 'PASS') {
      await db.query('UPDATE alerts SET episode_open=false WHERE episode_key=$1 AND episode_open=true', [
        key,
      ]);
      continue;
    }
    if (state !== 'EXCEED') continue;
    if (
      (await db.query('SELECT 1 FROM alerts WHERE episode_key=$1 AND episode_open=true', [key])).rows.length
    )
      continue;
    const alert = await insert(db, 'alerts', {
      id: id(),
      site_id: site,
      rule_id: rule.id,
      record_id: r.id,
      severity: rule.config.severity,
      summary: `${rule.name}: ${val} ${rule.config.unit}`,
      snapshot: JSON.stringify({ record: r, rule, value: val, evaluation: state }),
      episode_key: key,
    });
    const e = await event(db, a, site, 'alert', alert.id, 'RULE_EXCEED', null, alert);
    await notify(db, site, e.id, await supervisors(db, site), 'พบค่าที่เกินเกณฑ์ภายใน', '/alerts');
  }
}
