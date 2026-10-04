'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, ArrowUpRight, Download, Waves, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { DualChart, ScatterChart, ParameterChart, MiniTrend } from './charts';
import { MeetingBriefing } from './efficiency';
import { Empty, Table, fmt, shortDate, categoryNames, type Row } from './ui';

export function WastewaterParameters({ data, source }: { data: Row; source: (id: string) => void }) {
  const [code, setCode] = useState('COD'),
    [asset, setAsset] = useState('');
  const plots = data.analytics.ieatPlots || [],
    plot = plots.find((p: Row) => p.code === code);
  if (!plot) return null;
  const assets = [...new Set<string>(plots.flatMap((p: Row) => p.samples.map((s: Row) => s.asset)))];
  const chosen = assets.includes(asset) ? asset : assets[0];
  const samples = plot.samples.filter((s: Row) => s.asset === chosen);
  const latest = samples.at(-1);
  return (
    <section className="panel wastewater-parameters">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">
            <Waves size={14} /> WATER QUALITY
          </span>
          <h2>คุณภาพน้ำเสียที่ส่งเข้าระบบบำบัดส่วนกลางของนิคมฯ</h2>
          <p>ผลตรวจที่อนุมัติแล้ว · แยกจากปริมาณน้ำเสียที่บำบัดและการระบายสู่สิ่งแวดล้อม</p>
        </div>
        <span className="reference-badge">เกณฑ์อ้างอิง • รอยืนยัน</span>
      </div>
      <p className="notice amber">
        อ้างอิงประกาศ กนอ. 76/2560 สำหรับรับเข้าระบบส่วนกลาง ต้องยืนยันนิคมฯ ข้อตกลงรับน้ำเสีย
        และฉบับที่ใช้จริงก่อนเปิดเกณฑ์กฎหมาย เส้นอ้างอิงนี้ไม่ตัดสินผ่าน/ไม่ผ่าน
        และแสดงเฉพาะพารามิเตอร์เบื้องต้น 8 ค่า
      </p>
      <div className="parameter-grid">
        {plots.map((p: Row) => {
          const last = p.samples.filter((s: Row) => !chosen || s.asset === chosen).at(-1);
          return (
            <button
              key={p.code}
              className={'parameter-card ' + (p.code === code ? 'selected' : '')}
              onClick={() => setCode(p.code)}
              aria-pressed={p.code === code}
            >
              <span>{p.name}</span>
              <strong>
                {last?.qualifier ? last.raw : fmt(last?.value)} <small>{p.unit}</small>
              </strong>
              <small>
                อ้างอิง {p.label}
                {p.code === 'PH' ? '' : ' ' + p.unit}
              </small>
              <MiniTrend
                rows={p.samples.filter((s: Row) => s.asset === chosen)}
                label={p.name + ' รายตัวอย่าง'}
                upper={p.upper}
                lower={p.lower}
              />
              <small>
                {p.samples.filter((s: Row) => s.asset === chosen).length} ผล · นอกช่วงอ้างอิง{' '}
                {
                  p.samples.filter(
                    (s: Row) =>
                      s.asset === chosen &&
                      s.value !== null &&
                      (s.value > p.upper || (p.lower !== null && s.value < p.lower)),
                  ).length
                }{' '}
                ผล (รอยืนยัน)
              </small>
            </button>
          );
        })}
      </div>
      <div className="panel-heading">
        <div>
          <h3>{plot.name} · ผลรายตัวอย่าง</h3>
          <p>
            {latest
              ? 'ล่าสุด ' + shortDate(latest.date) + ' · ' + latest.sample
              : 'ยังไม่มีผลตรวจที่อนุมัติในช่วงนี้'}
          </p>
        </div>
        <label className="field">
          <span>จุดปล่อยให้นิคมฯ</span>
          <select
            aria-label="จุดปล่อยให้นิคมฯ"
            value={chosen || ''}
            onChange={(e) => setAsset(e.target.value)}
          >
            {assets.length ? (
              assets.map((a) => (
                <option key={a} value={a}>
                  {plot.samples.find((s: Row) => s.asset === a)?.assetName}
                </option>
              ))
            ) : (
              <option value="">ยังไม่มีข้อมูล</option>
            )}
          </select>
        </label>
      </div>
      {samples.length ? (
        <div className="chart-container">
          <ParameterChart plot={plot} samples={samples} source={source} />
        </div>
      ) : (
        <Empty text="ไม่มีผลตรวจของจุดปล่อยให้นิคมฯ ที่อนุมัติในช่วงนี้" />
      )}
      <div className="chart-key">
        <span>
          <i style={{ background: '#10aca6' }} />
          ผลตรวจที่อนุมัติแล้ว
        </span>
        <span>
          <i style={{ background: '#bf841b' }} />
          เส้นอ้างอิงรอยืนยัน
        </span>
      </div>
      <details>
        <summary>ค่ารายตัวอย่าง รุ่นเกณฑ์ที่ใช้ประเมิน และข้อมูลต้นทาง</summary>
        <Table headers={['วันที่ / Sample ID', 'ค่าตรวจวัด', 'เกณฑ์ที่ใช้ประเมินรายการ', 'ต้นทาง']}>
          {samples.map((s: Row) => (
            <tr key={s.id}>
              <td>
                {shortDate(s.date)}
                <small>{s.sample}</small>
              </td>
              <td>
                {s.raw}{' '}
                <small>
                  ปรับเป็น {s.qualifier ? s.raw : fmt(s.value)} {plot.unit}
                </small>
              </td>
              <td>
                {s.rule
                  ? `${s.rule.name} · รุ่น ${s.rule.version} · ${s.rule.config.regulatory ? 'กฎหมายที่อนุมัติแล้ว' : 'เกณฑ์ภายใน'}`
                  : 'ยังไม่มีเกณฑ์ที่เปิดใช้งาน'}
                <small>เส้นอ้างอิงบนกราฟไม่ใช่ผลตัดสิน</small>
              </td>
              <td>
                <button className="text-link" onClick={() => source(s.id)}>
                  เปิดผลตรวจ <ArrowUpRight size={13} />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      </details>
      <a className="subtle-link" href={data.analytics.ieatReference.url} target="_blank" rel="noreferrer">
        ดูประกาศ กนอ. 76/2560 <ArrowUpRight size={14} />
      </a>
    </section>
  );
}
function downloadChart(root: HTMLElement) {
  const svgs = Array.from(root.querySelectorAll('svg.data-chart'));
  const body = svgs
    .map((svg, i) => {
      const clone = svg.cloneNode(true) as SVGElement;
      // Nested SVGs default to the parent viewport; explicit dimensions keep both plots within the export.
      clone.setAttribute('width', '760');
      clone.setAttribute('height', '302');
      clone.setAttribute('x', '0');
      clone.setAttribute('y', String(i * 320));
      clone.removeAttribute('class');
      return clone.outerHTML;
    })
    .join('');
  const title = root.querySelector('h2')?.textContent || 'Environmental analysis';
  const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const metadata = root.dataset.exportMeta || '';
  const caveat = root.dataset.exportCaveat || '';
  const footnotes = (caveat.match(/.{1,90}/gu) || [])
    .map(
      (line, i) =>
        `<text x="20" y="${svgs.length * 320 + 145 + i * 18}" font-size="11" fill="#65748b">${escape(line)}</text>`,
    )
    .join('');
  const height = svgs.length * 320 + 170 + (caveat.match(/.{1,90}/gu) || []).length * 18;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${height}" viewBox="0 0 760 ${height}"><rect width="100%" height="100%" fill="white"/><style>text{font-family:Tahoma,sans-serif}</style><text x="20" y="25" font-size="16" fill="#203350">${escape(title)}</text><text x="20" y="48" font-size="11" fill="#65748b">${escape(metadata)}</text><text x="20" y="71" font-size="12" fill="#2688ed">${escape(root.dataset.exportX || '')}</text><text x="20" y="91" font-size="12" fill="#10aca6">${escape(root.dataset.exportY || '')}</text><g transform="translate(0 112)">${body}</g>${footnotes}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'environmental-comparison.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MonthlyAnalysis({
  data,
  source,
  openIssue,
}: {
  data: Row;
  source: (id: string) => void;
  openIssue?: (r: Row) => void;
}) {
  const router = useRouter(),
    [selected, setSelected] = useState('water-wastewater');
  const [view, setView] = useState('briefing');
  const pairs = data.analytics.comparison || [],
    pair = pairs.find((p: Row) => p.id === selected);
  if (!pair) return <Empty />;
  const labels = (category: string) =>
    category === 'WASTEWATER' ? 'น้ำเสียที่บำบัด' : categoryNames[category];
  const series = pair.rows.map((r: Row) => ({
    ...r,
    x: r.complete ? r.x : null,
    y: r.complete ? r.y : null,
  }));
  const site = data.sites.find((s: Row) => s.id === data.site);
  const month = (offset: number) => {
    const d = new Date(data.to + 'T12:00:00Z');
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + offset);
    const f = d.toISOString().slice(0, 10),
      end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    router.push('/analysis/monthly?' + new URLSearchParams({ site: data.site, from: f, to: end }));
  };
  return (
    <div className="stack meeting-page">
      <div className="presentation-toolbar panel">
        <div>
          <h2>เตรียมข้อมูลประชุมประจำเดือน</h2>
          <p>เลือกประเด็น → ดูแนวโน้มและความสัมพันธ์ → ตรวจต้นทาง → พิมพ์หรือบันทึก PDF</p>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={() => month(-1)}>
            เดือนก่อน
          </button>
          <button className="button secondary" onClick={() => month(0)}>
            เต็มเดือนที่เลือก
          </button>
          {data.permissions.includes('export') && (
            <button className="button" onClick={() => window.print()}>
              <Printer size={16} />
              พิมพ์ / PDF
            </button>
          )}
        </div>
      </div>
      <div className="meeting-view-tabs no-print">
        <button
          className={'button ' + (view === 'briefing' ? '' : 'secondary')}
          onClick={() => setView('briefing')}
        >
          ชุดประชุมทุกหมวด
        </button>
        <button
          className={'button ' + (view === 'comparison' ? '' : 'secondary')}
          onClick={() => setView('comparison')}
        >
          วิเคราะห์คู่ข้อมูล
        </button>
        <span>พิมพ์ตามมุมมองที่เลือก · เก็บ Snapshot ที่เมนูรายงาน</span>
      </div>
      <div className="pair-tabs" role="group" aria-label="ชุดข้อมูลที่นำมาเปรียบเทียบ">
        {pairs.map((p: Row) => (
          <button
            key={p.id}
            aria-pressed={p.id === selected}
            className={p.id === selected ? 'selected' : ''}
            onClick={() => {
              setSelected(p.id);
              setView('comparison');
            }}
          >
            {p.title}
          </button>
        ))}
      </div>
      {view === 'briefing' ? (
        <MeetingBriefing data={data} source={source} openIssue={openIssue} />
      ) : (
        <>
          <section
            className="panel meeting-slide"
            id="meeting-slide"
            data-export-meta={`${site?.name} · ${data.from} – ${data.to} · ${site?.demo ? 'Demo • ข้อมูลจำลอง' : 'Approved'} · ครบ ${pair.matched} คู่ / ตัดออก ${pair.excluded} · r=${fmt(pair.correlation, 3)}`}
            data-export-x={`สีน้ำเงิน / X: ${labels(pair.x)} (${pair.xUnit})`}
            data-export-y={`สีเขียว / Y: ${labels(pair.y)} (${pair.yUnit})`}
            data-export-caveat={`${pair.caveat} · สหสัมพันธ์ไม่พิสูจน์เหตุและผล · อัตราส่วน ${fmt(pair.ratio, 3)} ${pair.yUnit}/${pair.xUnit} จากผลรวมวันครบคู่`}
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">MONTHLY ENVIRONMENTAL REVIEW</span>
                <h2>{pair.title}</h2>
                <p>
                  {site?.name} · {shortDate(data.from)} – {shortDate(data.to)} ·{' '}
                  {site?.demo ? 'Demo • ข้อมูลจำลอง' : 'ข้อมูลที่อนุมัติแล้ว'}
                </p>
              </div>
              {data.permissions.includes('export') && (
                <button
                  className="button secondary no-print"
                  onClick={() => downloadChart(document.getElementById('meeting-slide')!)}
                >
                  <Download size={15} />
                  กราฟ SVG
                </button>
              )}
            </div>
            <p className="meeting-question">
              <BarChart3 size={20} />
              {pair.question}
            </p>
            <div className="analysis-metrics">
              <div>
                <span>วันที่ข้อมูลครบทั้งคู่</span>
                <strong>
                  {pair.matched} <small>วัน</small>
                </strong>
              </div>
              <div>
                <span>ตัดออกเพราะขาด / ไม่ครบ</span>
                <strong>
                  {pair.excluded} <small>วัน</small>
                </strong>
              </div>
              <div>
                <span>ความสัมพันธ์ Pearson r</span>
                <strong>{fmt(pair.correlation, 3)}</strong>
                <small>
                  {pair.correlation === null
                    ? 'ต้องมี ≥ 3 คู่ และค่าไม่คงที่'
                    : '−1 ถึง +1 · ไม่บ่งชี้เหตุและผล'}
                </small>
              </div>
              <div>
                <span>
                  {labels(pair.y)} / {labels(pair.x)}
                </span>
                <strong>{fmt(pair.ratio, 3)}</strong>
                <small>
                  {pair.yUnit}/{pair.xUnit} · ผลรวมวันครบคู่
                </small>
              </div>
            </div>
            {pair.matched === 0 ? (
              <Empty text="ยังไม่มีวันที่ข้อมูลทั้งสองชุดครบและอนุมัติแล้ว" />
            ) : (
              <div className="comparison-charts">
                <div>
                  <h3>แนวโน้มรายวัน</h3>
                  <DualChart
                    rows={series}
                    xLabel={labels(pair.x)}
                    yLabel={labels(pair.y)}
                    xUnit={pair.xUnit}
                    yUnit={pair.yUnit}
                  />
                </div>
                <div>
                  <h3>ความสัมพันธ์รายวัน</h3>
                  <ScatterChart pair={pair} source={source} />
                </div>
              </div>
            )}
            <p className="notice">
              {pair.caveat} · ใช้ช่วงเวลา Site และขอบเขตที่ตรงกัน ค่าสหสัมพันธ์ไม่พิสูจน์เหตุและผล
              วันที่ข้อมูลไม่ครบจะไม่เข้าคำนวณทั้งอัตราส่วนและ r
            </p>
            <div className="meeting-footer">
              <span>
                จัดทำ {new Date(data.analytics.issues.asOf).toLocaleString('th-TH')} ·{' '}
                {data.analytics.timezone}
              </span>
              <span>ข้อมูลจำลอง/ข้อมูลจริงตามป้าย Site · ตรวจสูตรและรุ่นได้จากต้นทาง</span>
            </div>
          </section>
          <section className="panel no-print">
            <h2>ตารางประกอบและหลักฐานข้อมูล</h2>
            <p>ค่าบางส่วนแสดงเพื่อให้ตรวจสอบได้ แต่ไม่ใช้ในกราฟคู่และสถิติ</p>
            <Table
              headers={[
                'วันที่',
                `${labels(pair.x)} (${pair.xUnit})`,
                `${labels(pair.y)} (${pair.yUnit})`,
                'การใช้คำนวณ',
                'แหล่งข้อมูล',
              ]}
            >
              {pair.rows.map((r: Row) => (
                <tr key={r.date}>
                  <td>{shortDate(r.date)}</td>
                  <td>{fmt(r.x)}</td>
                  <td>{fmt(r.y)}</td>
                  <td>{r.complete && r.x !== null && r.y !== null ? 'ครบคู่' : 'ตัดออก · ขาด / ไม่ครบ'}</td>
                  <td>
                    {r.sources.map((id: string, i: number) => (
                      <button key={id} className="text-link" onClick={() => source(id)}>
                        #{i + 1}{' '}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </Table>
            <Link
              className="subtle-link"
              href={'/reports?' + new URLSearchParams({ site: data.site, from: data.from, to: data.to })}
            >
              สร้างรายงานและ Snapshot ในระบบ <ArrowUpRight size={14} />
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
