'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Droplets,
  Zap,
  Recycle,
  Waves,
  ChevronRight,
  FileCheck2,
  Clock3,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Paperclip,
} from 'lucide-react';
import {
  Badge,
  Empty,
  Field,
  Table,
  Trend,
  fmt,
  shortDate,
  iso,
  categoryNames,
  JsonView,
  type Row,
} from './ui';
import type { Command } from './forms';
import { DualChart, MiniTrend } from './charts';
import { WastewaterParameters } from './analysis';
import { ProductionEfficiency, WasteVisuals } from './efficiency';
const icons = { WATER: Droplets, WASTEWATER: Waves, ENERGY: Zap, WASTE: Recycle };
export function Dashboard({
  data,
  category,
  source,
}: {
  data: Row;
  category?: string;
  source: (id: string) => void;
}) {
  const a = data.analytics;
  const kpis = a.kpis.filter((k: Row) => !category || k.category === category);
  const qs = `?site=${data.site}&from=${data.from}&to=${data.to}`;
  const water = a.kpis[0];
  const energy = a.kpis[2];
  return (
    <div className="stack">
      <div className="context-line">
        <span>
          <span className="live-dot" />
          ข้อมูลที่อนุมัติแล้ว · {shortDate(data.from)} – {shortDate(data.to)}
        </span>
        <span>
          อนุมัติล่าสุด {a.freshness ? new Date(a.freshness).toLocaleString('th-TH') : 'ยังไม่มี'} ·{' '}
          {a.timezone}
        </span>
      </div>
      <div className={'kpi-grid ' + (category ? 'single-category' : '')}>
        {kpis.map((k: Row) => {
          const Icon = icons[k.category as keyof typeof icons];
          return (
            <article className={'kpi-card ' + k.category.toLowerCase()} key={k.code}>
              <div className="kpi-top">
                <span>{k.name}</span>
                <span className="metric-icon">
                  <Icon size={20} />
                </span>
              </div>
              <div className="kpi-value">
                {fmt(k.value)} <span>{k.unit}</span>
              </div>
              <MiniTrend
                rows={k.daily}
                label={k.name + 'รายวัน'}
                color={
                  k.category === 'WATER'
                    ? '#2688ed'
                    : k.category === 'ENERGY'
                      ? '#479d72'
                      : k.category === 'WASTE'
                        ? '#d79539'
                        : '#10aca6'
                }
              />
              <div className={'kpi-comparison ' + (k.change === null ? '' : 'has-trend')}>
                {k.change === null
                  ? 'เปรียบเทียบ % ไม่ได้'
                  : `${k.change > 0 ? '+' : ''}${fmt(k.change)}% จากช่วงก่อนหน้า`}
              </div>
              <div className="kpi-bottom">
                <Badge value={k.status} />
                <Link
                  aria-label={'ดูรายละเอียด ' + k.name}
                  href={'/monitoring/' + k.category.toLowerCase() + qs}
                >
                  <ArrowUpRight size={18} />
                </Link>
              </div>
              <div className="coverage-track">
                <i style={{ width: (k.coverage.approvedPercent || 0) + '%' }} />
              </div>
              <small>
                อนุมัติ {k.coverage.approved}/{k.coverage.expected || 'ยังไม่ตั้งตาราง'} รายการคาดหวัง
              </small>
            </article>
          );
        })}
      </div>
      <div className="efficiency-strip">
        <span className="eyebrow">ประสิทธิภาพต่อการผลิต</span>
        {a.kpis
          .filter(
            (k: Row) =>
              ['WATER', 'ENERGY', 'WASTE'].includes(k.category) && (!category || k.category === category),
          )
          .map((k: Row) => (
            <div key={k.code}>
              <span>{k.name} / ผลผลิต</span>
              <strong>
                {fmt(k.intensity, 2)}{' '}
                <small>
                  {k.unit}/{k.productionUnit}
                </small>
              </strong>
              {k.intensity === null && <small>ผลผลิตเป็นศูนย์ ขาด หรือช่วงไม่ครบตรงกัน</small>}
            </div>
          ))}
        <Link href={'/data/production' + qs}>
          ข้อมูลการผลิต <ArrowUpRight size={14} />
        </Link>
      </div>
      {category ? (
        <>
          <ProductionEfficiency data={data} category={category} source={source} />
          {category === 'WASTE' && <WasteVisuals data={data} source={source} />}
          {category === 'WASTEWATER' && <WastewaterParameters data={data} source={source} />}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>แนวโน้ม{categoryNames[category]}</h2>
                <p>ค่ารายวัน · เว้นช่องว่างเมื่อไม่มีข้อมูล · {kpis[0].unit}</p>
              </div>
              <Badge value={kpis[0].status} />
            </div>
            <Trend series={kpis[0].daily} unit={kpis[0].unit} />
            <details>
              <summary>ตารางข้อมูลกราฟและสูตรคำนวณ</summary>
              <p>{kpis[0].formula}</p>
              <Table headers={['วันที่', 'ค่า', 'หน่วย']}>
                {kpis[0].daily.map((d: Row) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{fmt(d.value)}</td>
                    <td>{kpis[0].unit}</td>
                  </tr>
                ))}
              </Table>
            </details>
          </div>
          <div className="panel">
            <h2>รายละเอียดจุดวัดและขอบเขตการรวม</h2>
            <p>
              ค่าเฉลี่ยต่อวันที่ข้อมูลครบ {fmt(kpis[0].observedAverage)} {kpis[0].unit} ·{' '}
              {kpis[0].observedDays} วัน
            </p>
            <Table headers={['จุดวัด', 'ขอบเขต', 'ค่า', 'ข้อมูลต้นทาง']}>
              {(kpis[0].breakdown || []).map((b: Row) => (
                <tr key={b.asset}>
                  <td>{b.name}</td>
                  <td>{b.boundary === 'INCLUDED' ? 'รวมใน KPI' : 'ประกอบการวิเคราะห์'}</td>
                  <td>
                    {fmt(b.value)} {kpis[0].unit}
                  </td>
                  <td>
                    {b.sources.map((rid: string, i: number) => (
                      <button key={rid} className="text-link" onClick={() => source(rid)}>
                        #{i + 1}{' '}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </Table>
            {(kpis[0].reconciliation || []).map((r: Row) => (
              <p key={r.asset}>
                ส่วนต่างจุดหลัก {r.asset} กับจุดย่อย: {fmt(r.difference)} {kpis[0].unit} · เป็นการกระทบยอด
                ไม่ใช่ข้อสรุปการรั่วไหล
              </p>
            ))}
          </div>
          {category === 'WASTEWATER' && (
            <details className="panel">
              <summary>ผลคุณภาพน้ำทุกจุด • ตารางรายตัวอย่าง</summary>
              <p>ผ่านในผลที่ประเมินได้ {fmt(a.passRate)}% · ไม่ใช่อัตราความสอดคล้องกฎหมายทั้งโรงงาน</p>
              {!a.quality.length ? (
                <Empty text="ไม่มีผลตรวจแล็บที่อนุมัติในช่วงนี้" />
              ) : (
                <Table headers={['พารามิเตอร์', 'วันที่เก็บตัวอย่าง', 'ค่าดิบ', 'ผลประเมิน', 'แหล่งที่มา']}>
                  {a.quality.map((q: Row) => (
                    <tr key={q.id}>
                      <td>{q.parameter}</td>
                      <td>{shortDate(q.date)}</td>
                      <td>{Number.isFinite(Number(q.raw)) ? fmt(q.raw) : q.raw}</td>
                      <td>
                        <Badge value={q.status} />
                      </td>
                      <td>
                        <button className="text-link" onClick={() => source(q.id)}>
                          เปิดผลตรวจ
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </details>
          )}
          {category === 'ENERGY' && (
            <p className="notice">
              Peak demand: {fmt(a.peakDemand)} kW · ไม่คำนวณ demand จากข้อมูล kWh ·
              ยังไม่แสดงต้นทุนและสัดส่วนพลังงานหมุนเวียนเมื่อแหล่งข้อมูลไม่ครบ
            </p>
          )}
          {category === 'WASTE' && (
            <p className="notice">
              อัตรารีไซเคิล {fmt(a.recyclingRate)}% • ฐานจากขยะที่จัดการแล้ว {fmt(a.handled)} kg ·
              รายการส่งออกไม่บวกรวมเป็นปริมาณขยะเกิดใหม่ · คงเหลือ N/A จนยืนยัน opening stock
            </p>
          )}
          <div className="panel">
            <h2>ข้อมูลต้นทางและสูตร</h2>
            <p>{kpis[0].formula}</p>
            {kpis[0].sources.length ? (
              <div className="source-list">
                {kpis[0].sources.map((rid: string) => {
                  const r = data.records.find((r: Row) => r.id === rid);
                  return (
                    <button key={rid} onClick={() => source(rid)}>
                      <Link2 size={14} />
                      {r ? `${iso(r.event_date)} · ${r.asset_code} · ${r.value} ${r.unit}` : rid.slice(0, 8)}
                      <ArrowUpRight size={14} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty />
            )}
            {kpis[0].warnings.map((w: Row) => (
              <p className="notice amber" key={w.id}>
                {w.reason}{' '}
                <button className="text-link" onClick={() => source(w.id)}>
                  ตรวจต้นทาง
                </button>
              </p>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="dashboard-main">
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">RESOURCE MONITORING</span>
                  <h2>น้ำใช้และน้ำเสียที่บำบัด</h2>
                  <p>ปริมาณรายวันจากข้อมูลที่อนุมัติ · สเกลร่วม m³</p>
                </div>
                <Link className="subtle-link" href={'/monitoring/water' + qs}>
                  ดูรายละเอียด <ArrowUpRight size={15} />
                </Link>
              </div>
              <DualChart
                rows={water.daily.map((d: Row, i: number) => ({
                  date: d.date,
                  x: d.value,
                  y: a.kpis[1].daily[i].value,
                  xSources: d.sources,
                  ySources: a.kpis[1].daily[i].sources,
                }))}
                xLabel="น้ำใช้"
                yLabel="น้ำเสียที่บำบัด"
                xUnit="m³"
                yUnit="m³"
                onSource={source}
              />
              <Link className="subtle-link" href={'/analysis/monthly' + qs}>
                วิเคราะห์คู่ข้อมูลสำหรับประชุม <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="panel attention-panel">
              <div className="panel-heading">
                <h2>คิวที่ต้องติดตาม</h2>
                <span className="round-icon">
                  <Clock3 size={18} />
                </span>
              </div>
              <p>
                สถานะงานปัจจุบัน ณ{' '}
                {new Date(a.issues.asOf).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="status-orbit">
                <span
                  className="status-ring"
                  style={{
                    background: `conic-gradient(#15afa0 ${(water.coverage.approvedPercent ?? 0) * 3.6}deg, #edf3f7 0)`,
                  }}
                >
                  <strong>
                    {fmt(water.coverage.approvedPercent, 0)}
                    <small>{water.coverage.approvedPercent === null ? '' : '%'}</small>
                  </strong>
                </span>
                <div>
                  <strong>ความพร้อมข้อมูลน้ำใช้</strong>
                  <small>
                    อนุมัติ / ตารางคาดหวัง
                    <br />
                    ในช่วงที่เลือก
                  </small>
                </div>
              </div>
              <Link href="/issues?status=CRITICAL" className="attention-row">
                <span>
                  <span className="severity-dot critical" />
                  วิกฤต
                </span>
                <b>{a.issues.critical}</b>
              </Link>
              <Link href="/issues?status=OVERDUE" className="attention-row">
                <span>
                  <span className="severity-dot high" />
                  เกินกำหนด
                </span>
                <b>{a.issues.overdue}</b>
              </Link>
              <Link href="/issues?status=WAITING_VERIFICATION" className="attention-row">
                <span>
                  <span className="severity-dot review" />
                  รอตรวจผลงาน
                </span>
                <b>{a.issues.waiting}</b>
              </Link>
              <Link href="/issues?status=UNASSIGNED" className="attention-row">
                <span>
                  <span className="severity-dot neutral" />
                  ยังไม่มอบหมาย
                </span>
                <b>{a.issues.unassigned}</b>
              </Link>
              <Link className="attention-footer" href="/issues">
                เปิดงานทั้งหมด <ChevronRight size={17} />
              </Link>
            </div>
          </div>
          <div className="dashboard-lower">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>พลังงานไฟฟ้า</h2>
                  <p>แนวโน้มปริมาณใช้ · kWh</p>
                </div>
                <Zap size={20} className="gold" />
              </div>
              <Trend series={energy.daily} unit="kWh" color="#b78324" />
            </div>
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h2>ความครบถ้วนของข้อมูล</h2>
                  <p>แยกรายการที่ได้รับ และรายการที่อนุมัติ</p>
                </div>
                <FileCheck2 size={20} />
              </div>
              {a.kpis.map((k: Row) => (
                <div className="quality-row" key={k.code}>
                  <div>
                    <span>{categoryNames[k.category]}</span>
                    <strong>{fmt(k.coverage.approvedPercent, 0)}%</strong>
                  </div>
                  <div className="quality-track">
                    <i style={{ width: (k.coverage.approvedPercent || 0) + '%' }} />
                  </div>
                  <small>
                    ได้รับ {k.coverage.received}/{k.coverage.expected} · อนุมัติ {k.coverage.approved}/
                    {k.coverage.expected}
                  </small>
                </div>
              ))}
              <Link className="subtle-link" href={'/data/quality' + qs}>
                เปิดคิวตรวจและข้อมูลขาด <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <div className="section-intro">
            <span className="eyebrow">PRODUCTION-NORMALIZED PERFORMANCE</span>
            <h2>แนวโน้มประสิทธิภาพทุกหมวดเทียบผลผลิต</h2>
            <p>ดูอัตราต่อหน่วยและเป้าหมายภายใน แยกจากการเปลี่ยนแปลงยอดรวม</p>
          </div>
          <ProductionEfficiency data={data} source={source} compact />
          <WasteVisuals data={data} source={source} compact />
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h2>ประเด็นที่ต้องดำเนินการ</h2>
                <p>เรียงตามความรุนแรงของงานที่ยังเปิดอยู่</p>
              </div>
              <Link className="subtle-link" href="/issues">
                ดูทั้งหมด <ArrowUpRight size={14} />
              </Link>
            </div>
            {a.attention.length ? (
              <Table headers={['ประเด็น', 'ระดับ', 'สถานะ', 'กำหนดเสร็จ', '']}>
                {a.attention.map((i: Row) => (
                  <tr key={i.id}>
                    <td>
                      <small>{i.number}</small>
                      <strong>{i.title}</strong>
                    </td>
                    <td>
                      <Badge value={i.severity} />
                    </td>
                    <td>
                      <Badge value={i.status} />
                    </td>
                    <td>{shortDate(i.due_date)}</td>
                    <td>
                      <Link aria-label={'เปิด ' + i.number} href={'/issues/' + i.id}>
                        <ArrowUpRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty text="ไม่มีประเด็นที่รอดำเนินการ" />
            )}
          </div>
        </>
      )}
      <div className="method-note">
        <ShieldIcon />
        <span>
          คำนวณจากข้อมูลที่อนุมัติแล้วเท่านั้น · ไม่แทนค่าที่ขาดด้วยศูนย์ · ดูรุ่นและแหล่งข้อมูลได้ทุกรายการ
        </span>
      </div>
    </div>
  );
}
function ShieldIcon() {
  return <CheckCircle2 size={16} />;
}
export function RecordsTable({
  data,
  rows,
  source,
  command,
  onReject,
  category,
  quality = false,
}: {
  data: Row;
  rows: Row[];
  source: (id: string) => void;
  command: Command;
  onReject: (r: Row) => void;
  category?: string;
  quality?: boolean;
}) {
  const [search, setSearch] = useState(''),
    [state, setState] = useState(''),
    [page, setPage] = useState(0);
  const [result, setResult] = useState<Row>({ rows: [], total: 0 }),
    [fetchError, setFetchError] = useState(''),
    [fetching, setFetching] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setFetching(true);
      try {
        const q = new URLSearchParams({
          site: data.site,
          page: String(page),
          search,
          status: state,
          category: category || '',
          quality: quality ? '1' : '',
        });
        const res = await fetch('/api/records?' + q, { signal: abort.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setResult(body);
        setFetchError('');
      } catch (e) {
        if (!abort.signal.aborted) setFetchError((e as Error).message);
      } finally {
        if (!abort.signal.aborted) setFetching(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [data.site, rows, page, search, state, category, quality]);
  useEffect(() => {
    setPage(0);
  }, [data.site, category, quality]);
  const filtered: Row[] = result.rows;
  return (
    <div className="panel">
      <div className="table-toolbar">
        <input
          aria-label="ค้นหาข้อมูล"
          placeholder="ค้นหารหัส จุดวัด หรือเลขอ้างอิง…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="กรองสถานะ"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(0);
          }}
        >
          <option value="">ทุกสถานะ</option>
          {['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'VOIDED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {fetchError && (
        <p role="alert" className="error">
          {fetchError}
        </p>
      )}
      {fetching && <p role="status">กำลังโหลดข้อมูล…</p>}
      {filtered.length ? (
        <Table headers={['วันที่ / แหล่งข้อมูล', 'จุดวัด / พารามิเตอร์', 'ค่าที่วัด', 'สถานะ', 'ดำเนินการ']}>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td>
                {shortDate(r.event_date)}
                <small>
                  {categoryNames[r.category]} {r.demo ? '· Demo' : ''} · v{r.version}
                </small>
              </td>
              <td>
                <strong>{r.asset_code}</strong>
                <small>{r.parameter_code}</small>
              </td>
              <td className="numeric">
                {r.raw_value || fmt(r.value)} <span className="muted">{r.unit}</span>
              </td>
              <td>
                <Badge value={r.status} />
              </td>
              <td>
                <div className="row-actions">
                  <button className="text-link" onClick={() => source(r.id)}>
                    เปิดข้อมูล
                  </button>
                  {r.status === 'DRAFT' &&
                    r.created_by === data.actor.id &&
                    data.permissions.includes('entry') && (
                      <button
                        className="text-link"
                        onClick={() => command('record.submit', { id: r.id, version: r.lock_version })}
                      >
                        ส่งตรวจ
                      </button>
                    )}
                  {r.status === 'SUBMITTED' &&
                    r.created_by !== data.actor.id &&
                    data.permissions.includes('review') && (
                      <>
                        <button className="text-link" onClick={() => source(r.id)}>
                          ตรวจอนุมัติ
                        </button>
                        <button className="text-link danger" onClick={() => onReject(r)}>
                          ส่งกลับ
                        </button>
                      </>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty text="ไม่มีข้อมูลตรงกับตัวกรอง" />
      )}
      <div className="pagination">
        <span>{result.total} รายการ · หน้าละ 25</span>
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          ก่อนหน้า
        </button>
        <span>{page + 1}</span>
        <button disabled={(page + 1) * 25 >= result.total} onClick={() => setPage(page + 1)}>
          ถัดไป
        </button>
      </div>
    </div>
  );
}
export function IssueDetail({
  issue,
  data,
  open,
  command,
}: {
  issue: Row;
  data: Row;
  open: (modal: Row) => void;
  command: Command;
}) {
  const [tab, setTab] = useState('actions');
  const tasks = data.tasks.filter((t: Row) => t.issue_id === issue.id),
    evidence = data.evidence.filter((e: Row) => e.issue_id === issue.id);
  const actor = data.actor.id;
  const assigned = issue.owner_id === actor;
  const reviewers =
    data.permissions.includes('verify') &&
    actor !== issue.created_by &&
    actor !== issue.owner_id &&
    !tasks.some((t: Row) => t.owner_id === actor || t.completed_by === actor);
  const actions: Array<[string, string]> = [];
  if (
    data.permissions.includes('assign') &&
    ['OPEN', 'REOPENED', 'ASSIGNED', 'INVESTIGATING', 'ACTION_IN_PROGRESS'].includes(issue.status)
  )
    actions.push(['issue.assign', issue.owner_id ? 'ปรับผู้รับผิดชอบ' : 'มอบหมายงาน']);
  if (assigned) {
    if (['ACTION_IN_PROGRESS', 'VERIFIED'].includes(issue.status)) actions.push(['task.add', 'เพิ่ม Action']);
    if (issue.status === 'ASSIGNED') actions.push(['issue.investigate', 'เริ่มตรวจสอบ']);
    if (issue.status === 'INVESTIGATING') actions.push(['issue.plan', 'บันทึกแผนแก้ไข']);
    if (issue.status === 'ACTION_IN_PROGRESS') actions.push(['issue.submit', 'ส่งตรวจผลงาน']);
  }
  if (reviewers) {
    if (issue.status === 'WAITING_VERIFICATION') {
      if (issue.verifier_id === actor) actions.push(['issue.verify', 'ตรวจสอบผ่าน']);
      actions.push(['issue.reject', 'ส่งกลับแก้ไข']);
    }
    if (issue.status === 'VERIFIED') actions.push(['issue.close', 'ปิดงาน']);
    if (issue.status === 'CLOSED') actions.push(['issue.reopen', 'เปิดงานใหม่']);
  }
  const username = (id: string) => data.users.find((u: Row) => u.id === id)?.name || 'ยังไม่กำหนด';
  return (
    <div className="stack">
      <Link className="subtle-link" href="/issues">
        ← กลับรายการประเด็น
      </Link>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{issue.number}</span>
            <h2 className="issue-title">{issue.title}</h2>
          </div>
          <Badge value={issue.severity} />
        </div>
        <div className="issue-flow">
          {[
            'OPEN',
            'ASSIGNED',
            'INVESTIGATING',
            'ACTION_IN_PROGRESS',
            'WAITING_VERIFICATION',
            'VERIFIED',
            'CLOSED',
          ].map((s, i) => (
            <span className={issue.status === s ? 'current' : ''} key={s}>
              {i + 1} <Badge value={s} />
            </span>
          ))}
        </div>
        <div className="detail-grid">
          <div>
            <small>ผู้รับผิดชอบ</small>
            <strong>{username(issue.owner_id)}</strong>
          </div>
          <div>
            <small>ผู้ตรวจอิสระ</small>
            <strong>{username(issue.verifier_id)}</strong>
          </div>
          <div>
            <small>กำหนดเดิม / ปัจจุบัน</small>
            <strong>
              {shortDate(issue.original_due)} / {shortDate(issue.due_date)}
            </strong>
          </div>
          <div>
            <small>สถานะ / รุ่น</small>
            <strong>
              <Badge value={issue.status} /> · v{issue.version}
            </strong>
          </div>
        </div>
        <p className="pre-wrap">{issue.description}</p>
        {issue.source_record_id && (
          <button className="text-link" onClick={() => open({ type: 'source', id: issue.source_record_id })}>
            <Link2 size={15} />
            เปิดข้อมูลต้นทาง
          </button>
        )}
        <div className="action-bar">
          {actions.map(([action, title]) => (
            <button
              className={'button ' + (action === 'issue.reject' ? 'secondary' : '')}
              key={action}
              onClick={() => open({ type: 'issueAction', action, issue, title })}
            >
              {title}
            </button>
          ))}
        </div>
        {issue.status === 'ACTION_IN_PROGRESS' &&
          assigned &&
          (tasks.some((t: Row) => t.required && t.status !== 'DONE') || !evidence.length) && (
            <p className="notice amber">ก่อนส่งตรวจ: ทำ Action ให้ครบและแนบหลักฐานที่เปิดได้</p>
          )}
      </div>
      <div className="panel">
        <div className="tabs">
          {[
            ['actions', 'แผนและการดำเนินการ'],
            ['evidence', 'หลักฐาน (' + evidence.length + ')'],
            ['history', 'ประวัติและการตรวจ'],
          ].map(([key, title]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {title}
            </button>
          ))}
        </div>
        {tab === 'actions' && (
          <>
            <div className="detail-grid">
              <div>
                <small>ผลการตรวจเบื้องต้น</small>
                <p>{issue.investigation || 'ยังไม่ได้เริ่มตรวจ'}</p>
              </div>
              <div>
                <small>สาเหตุ / ข้อสันนิษฐาน</small>
                <p>{issue.root_cause || 'ยังไม่ยืนยัน'}</p>
              </div>
            </div>
            {!tasks.length ? (
              <Empty text="ยังไม่มี Action รอผู้รับผิดชอบเริ่มตรวจสอบ" />
            ) : (
              tasks.map((t: Row) => (
                <div className="task-card" key={t.id}>
                  <span className="round-icon">
                    <FileCheck2 size={20} />
                  </span>
                  <div>
                    <strong>{t.description}</strong>
                    <small>
                      {username(t.owner_id)} · กำหนด {shortDate(t.due_date)}
                    </small>
                    {t.result && <p>{t.result}</p>}
                  </div>
                  <Badge value={t.status} />
                  {t.owner_id === actor && ['ACTION_IN_PROGRESS', 'VERIFIED'].includes(issue.status) && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        open({
                          type: 'issueAction',
                          action: t.status === 'TODO' ? 'task.start' : 'task.done',
                          issue,
                          task_id: t.id,
                          title: t.status === 'TODO' ? 'เริ่ม Action' : 'บันทึกผล Action',
                        })
                      }
                    >
                      {t.status === 'TODO' ? 'เริ่มงาน' : 'บันทึกผล'}
                    </button>
                  )}
                </div>
              ))
            )}
          </>
        )}
        {tab === 'evidence' && (
          <>
            <div className="panel-heading">
              <p>ชุดหลักฐานมีรุ่นและ checksum ตรวจซ้ำก่อนปิดงาน</p>
              {(assigned || tasks.some((t: Row) => t.owner_id === actor)) &&
                !['CLOSED', 'CANCELLED'].includes(issue.status) && (
                  <button className="button" onClick={() => open({ type: 'evidence', issue })}>
                    <Paperclip size={16} />
                    แนบหลักฐาน
                  </button>
                )}
            </div>
            {evidence.length ? (
              evidence.map((e: Row) => (
                <div className="evidence-card" key={e.id}>
                  <Paperclip size={20} />
                  <div>
                    <a href={'/api/evidence/' + e.id}>{e.filename}</a>
                    <small>
                      v{e.version} · {fmt(e.size / 1024)} KB ·{' '}
                      {e.scan_status === 'DEV_VALIDATED'
                        ? 'ตรวจชนิดไฟล์สำหรับ local เท่านั้น'
                        : e.scan_status}
                    </small>
                  </div>
                  <span>{shortDate(e.created_at)}</span>
                </div>
              ))
            ) : (
              <Empty text="ยังไม่มีหลักฐาน" />
            )}
          </>
        )}
        {tab === 'history' && (
          <div className="timeline">
            {data.events
              .filter((e: Row) => e.entity_id === issue.id)
              .map((e: Row) => (
                <div key={e.id}>
                  <span className="timeline-dot" />
                  <strong>{e.action}</strong>
                  <small>
                    {username(e.actor_id)} · {new Date(e.created_at).toLocaleString('th-TH')}
                  </small>
                  {e.reason && <p>{e.reason}</p>}
                  <details>
                    <summary>ดูการเปลี่ยนแปลง</summary>
                    <JsonView value={{ before: e.before_data, after: e.after_data }} />
                  </details>
                </div>
              ))}
          </div>
        )}
      </div>
      {issue.completion && (
        <div className="panel">
          <h2>สรุปการทำงาน</h2>
          <p>{issue.completion}</p>
          {issue.closure && (
            <>
              <h3>สรุปปิดงาน</h3>
              <p>{issue.closure}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
