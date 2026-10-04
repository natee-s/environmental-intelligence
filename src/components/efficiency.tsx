'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ClipboardList } from 'lucide-react';
import { DualChart, MetricChart, MiniTrend, WasteStackChart, WasteDonut, ParameterChart } from './charts';
import { Empty, Table, fmt, shortDate, categoryNames, type Row } from './ui';

const colors: Record<string, string> = {
  WATER: '#2688ed',
  WASTEWATER: '#10aca6',
  ENERGY: '#479d72',
  WASTE: '#d79539',
};
export function SheetHeading({ data, title, kicker }: { data: Row; title: string; kicker: string }) {
  const site = data.sites.find((s: Row) => s.id === data.site);
  return (
    <div className="sheet-heading">
      <span className="eyebrow">{kicker}</span>
      <h2>{title}</h2>
      <p>
        {site?.name} · {shortDate(data.from)} – {shortDate(data.to)} ·{' '}
        {site?.demo ? 'Demo • ข้อมูลสมมติ' : 'ข้อมูลที่อนุมัติแล้ว'}
      </p>
    </div>
  );
}
export function ProductionEfficiency({
  data,
  category,
  source,
  compact = false,
  sheet = false,
  openIssue,
}: {
  data: Row;
  category?: string;
  source: (id: string) => void;
  compact?: boolean;
  sheet?: boolean;
  openIssue?: (r: Row) => void;
}) {
  const pairs = data.analytics.comparison.filter(
    (p: Row) => p.x === 'PRODUCTION' && (!category || p.y === category),
  );
  return (
    <div className={compact ? 'efficiency-grid' : 'stack'}>
      {pairs.map((pair: Row) => (
        <EfficiencyPanel
          key={pair.id}
          data={data}
          pair={pair}
          source={source}
          compact={compact}
          sheet={sheet}
          openIssue={openIssue}
        />
      ))}
    </div>
  );
}
function EfficiencyPanel({
  data,
  pair,
  source,
  compact,
  sheet,
  openIssue,
}: {
  data: Row;
  pair: Row;
  source: (id: string) => void;
  compact: boolean;
  sheet: boolean;
  openIssue?: (r: Row) => void;
}) {
  const [mode, setMode] = useState('intensity');
  const name = pair.y === 'WASTEWATER' ? 'น้ำเสียที่บำบัด' : categoryNames[pair.y],
    unit = pair.yUnit + '/' + pair.xUnit;
  const quantity = pair.rows.map((r: Row) => ({
    ...r,
    x: r.complete ? r.x : null,
    y: r.complete ? r.y : null,
  }));
  const top = pair.topDays[0];
  const action = (r: Row) =>
    openIssue?.({
      title: `ตรวจสอบ${name}ต่อหน่วยผลิตวันที่ ${r.date}`,
      category: pair.y,
      severity: 'MEDIUM',
      detected_date: r.date,
      source_record_id: r.ySources?.[0] || r.sources[0],
      description: `ข้อมูลที่อนุมัติแล้ว ${r.date}: ${name} ${fmt(r.y)} ${pair.yUnit} / ผลผลิต ${fmt(r.x)} ${pair.xUnit} = ${fmt(r.value, 3)} ${unit}${r.limit !== null ? ` เทียบเป้าหมายภายใน ${r.limit} ${unit}` : ''}\nขอให้ตรวจภาระฐาน product mix และกิจกรรมของวันนั้นก่อนสรุปสาเหตุ\nแหล่งข้อมูลประกอบ: ${r.sources.join(', ')}\nช่วงประชุม ${data.from} – ${data.to}`,
    });
  return (
    <section
      className={'panel efficiency-panel ' + (sheet ? 'meeting-sheet ' : '') + (compact ? 'compact' : '')}
      id={'efficiency-' + pair.y}
    >
      {sheet ? (
        <SheetHeading
          data={data}
          title={name + 'เทียบกับผลผลิต'}
          kicker="PRODUCTION-NORMALIZED PERFORMANCE"
        />
      ) : (
        <div className="panel-heading">
          <div>
            <span className="eyebrow">EFFICIENCY / {pair.y}</span>
            <h2>{name}ต่อหน่วยผลิต</h2>
            <p>แยกภาระทรัพยากรกับผลจากปริมาณการผลิต</p>
          </div>
          <Link
            className="subtle-link no-print"
            href={
              '/analysis/monthly?' + new URLSearchParams({ site: data.site, from: data.from, to: data.to })
            }
          >
            ชุดประชุม <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <div className="efficiency-statline">
        <div>
          <span>อัตรารวมของวันครบคู่</span>
          <strong style={{ color: colors[pair.y] }}>
            {fmt(pair.ratio, 3)} <small>{unit}</small>
          </strong>
        </div>
        <div>
          <span>เป้าหมายภายใน{pair.periodTarget?.config.demo ? ' • Demo' : ''}</span>
          <strong>
            {pair.periodTarget ? fmt(pair.periodTarget.config.limit) : '—'}{' '}
            <small>{pair.periodTarget ? unit : ''}</small>
          </strong>
          <small>
            {pair.targetStatus === 'MIXED'
              ? 'มีหลายรุ่น/ช่วงขาด ดูเป้าหมายรายวัน'
              : pair.targetStatus === 'UNCONFIGURED'
                ? 'ยังไม่มีเป้าหมายที่อนุมัติ'
                : pair.targetStatus === 'ABOVE'
                  ? 'สูงกว่าเป้าหมายของช่วง'
                  : 'อยู่ในเป้าหมายของช่วง'}
          </small>
        </div>
        <div>
          <span>ครบคู่ / วันในช่วง</span>
          <strong>
            {pair.matched}
            <small> / {pair.rows.length} วัน</small>
          </strong>
          <small>
            สูงกว่าเป้าหมาย {pair.aboveTargetDays}/{pair.targetEvaluatedDays} วันประเมินได้
          </small>
        </div>
      </div>
      {pair.matched === 0 ? (
        <Empty text={'ยังไม่มีข้อมูล' + name + 'และผลผลิตที่ครบคู่'} />
      ) : (
        <>
          {compact && (
            <div className="chart-mode no-print">
              <button aria-pressed={mode === 'intensity'} onClick={() => setMode('intensity')}>
                อัตราต่อหน่วยผลิต
              </button>
              <button aria-pressed={mode === 'quantity'} onClick={() => setMode('quantity')}>
                ปริมาณ × ผลผลิต
              </button>
            </div>
          )}
          <div className={compact ? 'compact-efficiency-chart' : 'efficiency-charts'}>
            {(!compact || mode === 'quantity') && (
              <div className="quantity-chart">
                <h3>ปริมาณ × ผลผลิต</h3>
                <DualChart
                  rows={quantity}
                  xLabel="ผลผลิต"
                  yLabel={name}
                  xUnit={pair.xUnit}
                  yUnit={pair.yUnit}
                  onSource={source}
                />
              </div>
            )}
            {(!compact || mode === 'intensity') && (
              <div className="intensity-chart">
                <h3>แนวโน้มอัตราต่อหน่วยผลิต</h3>
                <MetricChart
                  rows={pair.dailyIntensity}
                  unit={unit}
                  label={'ประสิทธิภาพ ' + name + ' ต่อผลผลิต'}
                  color={colors[pair.y]}
                  source={source}
                />
                <div className="chart-key">
                  <span>
                    <i style={{ background: colors[pair.y] }} />
                    อัตรารายวัน
                  </span>
                  <span>
                    <i style={{ background: '#a67420' }} />
                    เป้าหมายภายในที่อนุมัติ
                  </span>
                </div>
              </div>
            )}
          </div>
          {top && (
            <div className="peak-callout">
              <div>
                <small>วันที่อัตราต่อหน่วยสูงสุดในช่วง</small>
                <strong>
                  {shortDate(top.date)} · {fmt(top.value, 3)} {unit}
                </strong>
              </div>
              <button
                className="text-link no-print"
                onClick={() => source(top.ySources?.[0] || top.sources[0])}
              >
                ตรวจต้นทาง <ArrowUpRight size={14} />
              </button>
              {!compact && openIssue && data.permissions.includes('issue') && (
                <button className="button secondary no-print" onClick={() => action(top)}>
                  <ClipboardList size={15} />
                  เปิดประเด็นตรวจสอบ
                </button>
              )}
            </div>
          )}
          {!compact && (
            <Table headers={['วันที่อัตราสูงสุด', 'ผลผลิต', name, 'อัตราต่อหน่วย', 'ต้นทาง']}>
              {pair.topDays.map((r: Row) => (
                <tr key={r.date}>
                  <td>{shortDate(r.date)}</td>
                  <td>
                    {fmt(r.x)} {pair.xUnit}
                  </td>
                  <td>
                    {fmt(r.y)} {pair.yUnit}
                  </td>
                  <td>
                    {fmt(r.value, 3)} {unit}
                  </td>
                  <td>
                    {r.sources.map((id: string, i: number) => (
                      <button className="text-link" key={id} onClick={() => source(id)}>
                        #{i + 1}{' '}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
      <p className="chart-method">
        {pair.formula} · วันผลิตศูนย์แต่มีภาระ {pair.idleDays.length} วัน · {pair.caveat}
      </p>
      {pair.periodTarget && (
        <small className="target-lineage">
          {pair.periodTarget.name} · v{pair.periodTarget.version} · {pair.periodTarget.config.reference}
        </small>
      )}
    </section>
  );
}
export function WasteVisuals({
  data,
  source,
  sheet = false,
  compact = false,
}: {
  data: Row;
  source: (id: string) => void;
  sheet?: boolean;
  compact?: boolean;
}) {
  const c = data.analytics.wasteComposition;
  if (!c) return null;
  return (
    <section className={'panel waste-visuals ' + (sheet ? 'meeting-sheet' : '')}>
      {sheet ? (
        <SheetHeading data={data} title="ขยะเกิดขึ้นแยกประเภท" kicker="WASTE GENERATION & COMPOSITION" />
      ) : (
        <div className="panel-heading">
          <div>
            <h2>ขยะเกิดขึ้นแยกประเภท</h2>
            <p>Recycle · อันตราย · ทั่วไป · ส่วนที่ยังไม่ทราบ</p>
          </div>
          <strong>
            {fmt(c.total)} <small>kg</small>
          </strong>
        </div>
      )}
      {c.total === null ? (
        <Empty text="ไม่มีข้อมูลขยะเกิดขึ้นที่อนุมัติในช่วงนี้" />
      ) : (
        <>
          <div className="waste-composition-grid">
            <WasteDonut composition={c} />
            <div className="waste-type-cards">
              {c.categories.map((type: Row) => (
                <div className="waste-type-card" key={type.code}>
                  <span>
                    <i style={{ background: type.color }} />
                    {type.name}
                  </span>
                  <strong>
                    {fmt(type.value)} <small>kg · {fmt(type.share)}%</small>
                  </strong>
                  {!compact && (
                    <MiniTrend
                      rows={c.daily.map((r: Row) => ({ date: r.date, value: r[type.code] }))}
                      label={type.name}
                      color={type.color}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          {!compact && (
            <>
              <h3>ปริมาณรายวัน · สีแยกประเภท</h3>
              <WasteStackChart composition={c} source={source} />
              <details className="no-print">
                <summary>ตารางปริมาณแยกประเภทและต้นทาง</summary>
                <Table headers={['วันที่', ...c.categories.map((x: Row) => x.name), 'ยอดหลัก', 'ต้นทาง']}>
                  {c.daily.map((r: Row) => (
                    <tr key={r.date}>
                      <td>{shortDate(r.date)}</td>
                      {c.categories.map((x: Row) => (
                        <td key={x.code}>{fmt(r[x.code])}</td>
                      ))}
                      <td>{fmt(r.total)}</td>
                      <td>
                        {[...new Set<string>(Object.values(r.sources).flat() as string[])].map((id, i) => (
                          <button className="text-link" key={id} onClick={() => source(id)}>
                            #{i + 1}{' '}
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </Table>
              </details>
            </>
          )}
          <p className="chart-method">
            แยกประเภทและกระทบยอดครบ {c.classifiedDays}/{c.observedDays} วันที่มียอดหลัก · {c.formula} ·
            “Recycle” เป็นประเภทขยะเกิดขึ้น ไม่ใช่อัตราที่ส่งไปรีไซเคิลสำเร็จ
          </p>
          {c.warnings.map((w: string) => (
            <p className="notice amber" key={w}>
              {w}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
export function MeetingBriefing({
  data,
  source,
  openIssue,
}: {
  data: Row;
  source: (id: string) => void;
  openIssue?: (r: Row) => void;
}) {
  const a = data.analytics,
    pairs = a.comparison.filter((p: Row) => p.x === 'PRODUCTION');
  const coverage = [
    ...a.kpis.map((k: Row) => ({ name: categoryNames[k.category], ...k.coverage })),
    { name: 'ผลผลิต', ...a.production.coverage },
  ];
  const plots = a.ieatPlots || [],
    assets = [...new Set<string>(plots.flatMap((p: Row) => p.samples.map((s: Row) => s.asset)))];
  const [selected, setSelected] = useState('');
  const asset = assets.includes(selected) ? selected : assets[0];
  const site = data.sites.find((s: Row) => s.id === data.site);
  return (
    <div className="stack meeting-deck">
      <section className="panel meeting-sheet executive-sheet">
        <SheetHeading
          data={data}
          title="ภาพรวมเพื่อการตัดสินใจด้านสิ่งแวดล้อม"
          kicker="MONTHLY MANAGEMENT BRIEFING"
        />
        {site?.demo && (
          <p className="notice amber">
            Demo • ข้อมูลสมมติสำหรับทดลองประชุม เป้าหมายภายในเป็นตัวอย่าง ไม่ใช่ค่าจริงหรือข้อรับรองกฎหมาย
          </p>
        )}
        <div className="executive-metrics">
          <div>
            <span>ผลผลิตที่อนุมัติในช่วง</span>
            <strong>
              {fmt(a.production.value)} <small>{a.production.unit || 'ยังไม่กำหนดหน่วย'}</small>
            </strong>
          </div>
          <div>
            <span>รายการอนุมัติ / คาดหวัง</span>
            <strong>
              {coverage.reduce((s: number, c: Row) => s + c.approved, 0)}{' '}
              <small>/ {coverage.reduce((s: number, c: Row) => s + c.expected, 0)}</small>
            </strong>
          </div>
          <div>
            <span>ประเด็นยังเปิด • ปัจจุบัน</span>
            <strong>{a.issues.active}</strong>
          </div>
          <div>
            <span>ปิดงานในช่วงประชุม</span>
            <strong>{a.issues.closedInPeriod}</strong>
          </div>
        </div>
        <div className="executive-resources">
          {pairs.map((p: Row) => {
            const k = a.kpis.find((k: Row) => k.category === p.y);
            return (
              <div key={p.id}>
                <span>
                  {categoryNames[p.y]} · {fmt(k.value)} {k.unit}
                </span>
                <strong style={{ color: colors[p.y] }}>
                  {fmt(p.ratio, 3)}{' '}
                  <small>
                    {p.yUnit}/{p.xUnit}
                  </small>
                </strong>
                <MiniTrend
                  rows={p.dailyIntensity}
                  label={categoryNames[p.y] + 'ต่อผลผลิต'}
                  color={colors[p.y]}
                />
                <small>
                  ครบคู่ {p.matched}/{p.rows.length} วัน · สูงกว่าเป้าหมาย {p.aboveTargetDays}/
                  {p.targetEvaluatedDays}
                </small>
              </div>
            );
          })}
        </div>
        <div className="briefing-bottom">
          <div>
            <h3>ความพร้อมของข้อมูล</h3>
            {coverage.map((c: Row) => (
              <div className="briefing-coverage" key={c.name}>
                <span>{c.name}</span>
                <div className="quality-track">
                  <i style={{ width: (c.approvedPercent ?? 0) + '%' }} />
                </div>
                <strong>{fmt(c.approvedPercent, 0)}%</strong>
                <small>
                  {c.approved}/{c.expected} รายการ
                </small>
              </div>
            ))}
          </div>
          <div>
            <h3>ประเด็นที่ควรตัดสินใจ / ให้ทีมตรวจ</h3>
            {pairs.map((p: Row) => (
              <p className="decision-row" key={p.id}>
                <strong>{categoryNames[p.y]}:</strong>{' '}
                {p.topDays[0]
                  ? `${shortDate(p.topDays[0].date)} อัตราสูงสุด ${fmt(p.topDays[0].value, 3)} ${p.yUnit}/${p.xUnit}`
                  : 'ยังไม่มีข้อมูลพอประเมิน'}
                {p.idleDays.length > 0 ? ` · ใช้ทรัพยากรในวันผลิตศูนย์ ${p.idleDays.length} วัน` : ''}
                <button
                  className="text-link no-print"
                  onClick={() => p.topDays[0] && source(p.topDays[0].ySources[0])}
                >
                  ตรวจต้นทาง
                </button>
              </p>
            ))}
            <p className="decision-row">
              คิวงานปัจจุบัน: เกินกำหนด {a.issues.overdue} · รอตรวจ {a.issues.waiting} · ยังไม่มอบหมาย{' '}
              {a.issues.unassigned}
              <Link href="/issues" className="text-link no-print">
                เปิดคิวงาน
              </Link>
            </p>
          </div>
        </div>
        <p className="chart-method">
          ใช้เฉพาะ approved facts และวันที่ข้อมูลครบคู่ ไม่สรุปสาเหตุจากกราฟ; ตรวจวันหยุด การล้างระบบ และ
          product mix ก่อนเลือก Action · สถานะงานปัจจุบัน ณ {new Date(a.issues.asOf).toLocaleString('th-TH')}
        </p>
      </section>
      <ProductionEfficiency data={data} source={source} sheet openIssue={openIssue} />
      <WasteVisuals data={data} source={source} sheet />
      <div className="panel no-print">
        <label className="field">
          <span>จุดปล่อยสำหรับกราฟคุณภาพในชุดประชุม</span>
          <select
            aria-label="จุดปล่อยสำหรับชุดประชุม"
            value={asset || ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {assets.map((code) => (
              <option key={code} value={code}>
                {plots.flatMap((p: Row) => p.samples).find((s: Row) => s.asset === code)?.assetName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {[0, 1].map((page) => (
        <section className="panel meeting-sheet wastewater-sheet" key={page}>
          <SheetHeading
            data={data}
            title={`แนวโน้มคุณภาพน้ำเสียก่อนส่งนิคมฯ (${page + 1}/2)`}
            kicker="WASTEWATER QUALITY / REFERENCE ONLY"
          />
          <p className="notice amber">
            จุดวัด {asset || 'ยังไม่มีข้อมูล'} · เส้นอ้างอิง กนอ. 76/2560 ยังรอยืนยัน ไม่ใช่ผลตัดสินกฎหมาย ·
            ไม่หารความเข้มข้นด้วยปริมาณผลิต
          </p>
          <div className="water-quality-sheet-grid">
            {plots.slice(page * 4, page * 4 + 4).map((p: Row) => {
              const samples = p.samples.filter((s: Row) => s.asset === asset),
                last = samples.at(-1),
                outside = samples.filter(
                  (s: Row) =>
                    s.value !== null && (s.value > p.upper || (p.lower !== null && s.value < p.lower)),
                ).length;
              return (
                <div className="water-quality-chart" key={p.code}>
                  <h3>
                    {p.name}{' '}
                    <small>
                      ล่าสุด {last?.qualifier ? last.raw : fmt(last?.value)} {p.unit} · {samples.length} ผล
                    </small>
                  </h3>
                  {samples.length ? (
                    <div className="chart-container">
                      <ParameterChart plot={p} samples={samples} source={source} />
                    </div>
                  ) : (
                    <Empty text="ไม่มีผลที่อนุมัติของจุดนี้" />
                  )}
                  <small>
                    อ้างอิง {p.label} {p.unit} · นอกช่วงอ้างอิง {outside} ผล · รอยืนยันการใช้
                  </small>
                </div>
              );
            })}
          </div>
          <a className="subtle-link" href={a.ieatReference.url} target="_blank" rel="noreferrer">
            เอกสารต้นฉบับ: {a.ieatReference.title}
          </a>
        </section>
      ))}
    </div>
  );
}
