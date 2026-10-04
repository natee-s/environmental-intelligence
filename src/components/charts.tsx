'use client';
import { useId } from 'react';
import { fmt, shortDate, type Row } from './ui';

const blue = '#2688ed',
  teal = '#10aca6';
function segments(rows: Row[], field: string, x: (i: number) => number, y: (n: number) => number) {
  const result: string[] = [];
  let points = '';
  rows.forEach((r, i) => {
    if (r[field] === null || r[field] === undefined) {
      if (points) result.push(points);
      points = '';
    } else points += `${points ? ' L' : 'M'}${x(i)},${y(r[field])}`;
  });
  if (points) result.push(points);
  return result;
}
export function DualChart({
  rows,
  xLabel,
  yLabel,
  xUnit,
  yUnit,
  onSource,
}: {
  rows: Row[];
  xLabel: string;
  yLabel: string;
  xUnit: string;
  yUnit: string;
  onSource?: (id: string) => void;
}) {
  const id = useId().replace(/:/g, '');
  const shared = xUnit === yUnit;
  const maxX = Math.max(1, ...rows.map((r) => r.x ?? 0), ...(shared ? rows.map((r) => r.y ?? 0) : [])) * 1.15;
  const maxY = shared ? maxX : Math.max(1, ...rows.map((r) => r.y ?? 0)) * 1.15;
  const x = (i: number) => 72 + (i * 616) / Math.max(1, rows.length - 1);
  const y = (n: number, max: number) => 252 - (n / max) * 205;
  return (
    <div className="chart-container">
      <div className="chart-key">
        <span>
          <i style={{ background: blue }} />
          {xLabel} ({xUnit})
        </span>
        <span>
          <i style={{ background: teal }} />
          {yLabel} ({yUnit})
        </span>
      </div>
      <svg
        className="data-chart"
        viewBox="0 0 760 302"
        role="img"
        aria-label={`แนวโน้มคู่ ${xLabel} และ ${yLabel} ${shared ? 'สเกลร่วม' : 'แกนซ้ายและขวาต่างหน่วย'}`}
      >
        <defs>
          {[blue, teal].map((color, i) => (
            <linearGradient key={color} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor={color} stopOpacity=".2" />
              <stop offset="1" stopColor={color} stopOpacity=".01" />
            </linearGradient>
          ))}
        </defs>
        <text x="12" y="22" fill={blue} fontSize="16">
          {xUnit}
        </text>
        {!shared && (
          <text x="748" y="22" textAnchor="end" fill={teal} fontSize="16">
            {yUnit}
          </text>
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1="72" x2="688" y1={y(maxX * f, maxX)} y2={y(maxX * f, maxX)} stroke="#e8eef4" />
            <text x="62" y={y(maxX * f, maxX) + 4} textAnchor="end" fontSize="16" fill="#65748b">
              {fmt(maxX * f, 0)}
            </text>
            {!shared && (
              <text x="698" y={y(maxX * f, maxX) + 4} fontSize="16" fill="#168b88">
                {fmt(maxY * f, 0)}
              </text>
            )}
          </g>
        ))}
        {['x', 'y'].map((field, s) => (
          <g key={field}>
            {segments(rows, field, x, (n) => y(n, s ? maxY : maxX)).map((path, i) => {
              // Each area closes its own contiguous segment; gaps remain gaps.
              const start = Number(path.match(/^M([\d.]+)/)?.[1] || 72);
              const end = Number(path.match(/[ML]([\d.]+),[^ML]+$/)?.[1] || start);
              return (
                <g key={i}>
                  <path d={`${path} L${end},252 L${start},252 Z`} fill={`url(#${id}-${s})`} />
                  <path d={path} stroke={s ? teal : blue} strokeWidth="2.8" fill="none" />
                </g>
              );
            })}
            {rows.map((r, i) =>
              r[field] == null ? null : (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={y(r[field], s ? maxY : maxX)}
                  r="4"
                  fill={s ? teal : blue}
                  stroke="white"
                  strokeWidth="1.5"
                  tabIndex={0}
                  role={onSource && (r[field + 'Sources'] || r.sources)?.length ? 'button' : undefined}
                  aria-label={`${shortDate(r.date)} ${s ? yLabel : xLabel} ${fmt(r[field])} ${s ? yUnit : xUnit}`}
                  onClick={() => {
                    const rid = (r[field + 'Sources'] || r.sources)?.[0];
                    if (onSource && rid) onSource(rid);
                  }}
                  onKeyDown={(e) => {
                    const rid = (r[field + 'Sources'] || r.sources)?.[0];
                    if (e.key === 'Enter' && onSource && rid) onSource(rid);
                  }}
                >
                  <title>
                    {shortDate(r.date)} · {s ? yLabel : xLabel}: {fmt(r[field])} {s ? yUnit : xUnit}
                  </title>
                </circle>
              ),
            )}
          </g>
        ))}
        {rows.map((r, i) =>
          i % Math.max(1, Math.ceil(rows.length / 7)) === 0 || i === rows.length - 1 ? (
            <text key={i} x={x(i)} y="280" textAnchor="middle" fill="#65748b" fontSize="16">
              {shortDate(r.date)}
            </text>
          ) : null,
        )}
      </svg>
      <small>
        {shared
          ? 'ใช้สเกลเดียวกัน'
          : 'แกนซ้าย: ' +
            xLabel +
            ' · แกนขวา: ' +
            yLabel +
            ' · ความสูงของเส้นต่างหน่วยเปรียบเทียบโดยตรงไม่ได้'}{' '}
        · ช่องว่างคือข้อมูลขาด/ไม่ครบ
      </small>
    </div>
  );
}
export function ScatterChart({ pair, source }: { pair: Row; source: (id: string) => void }) {
  const rows = pair.rows.filter((r: Row) => r.complete && r.x !== null && r.y !== null);
  const mx = Math.max(1, ...rows.map((r: Row) => r.x)) * 1.15,
    my = Math.max(1, ...rows.map((r: Row) => r.y)) * 1.15;
  const x = (n: number) => 80 + (n / mx) * 600,
    y = (n: number) => 250 - (n / my) * 200;
  return (
    <div className="chart-container">
      <svg
        className="data-chart"
        viewBox="0 0 760 302"
        role="img"
        aria-label={'กราฟความสัมพันธ์ ' + pair.title}
      >
        <text x="14" y="20" fill="#168b88" fontSize="16">
          Y · {pair.yUnit}
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1="80" x2="680" y1={y(my * f)} y2={y(my * f)} stroke="#e8eef4" />
            <line x1={x(mx * f)} x2={x(mx * f)} y1="50" y2="250" stroke="#f0f4f8" />
            <text x="69" y={y(my * f) + 4} textAnchor="end" fontSize="16" fill="#65748b">
              {fmt(my * f, 0)}
            </text>
            <text x={x(mx * f)} y="272" textAnchor="middle" fontSize="16" fill="#65748b">
              {fmt(mx * f, 0)}
            </text>
          </g>
        ))}
        {rows.map((r: Row) => (
          <circle
            key={r.date}
            cx={x(r.x)}
            cy={y(r.y)}
            r="6"
            fill={teal}
            fillOpacity=".7"
            stroke="white"
            strokeWidth="2"
            tabIndex={0}
            role="button"
            aria-label={`${shortDate(r.date)} X ${fmt(r.x)} Y ${fmt(r.y)} เปิดต้นทาง`}
            onClick={() => r.sources[0] && source(r.sources[0])}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && r.sources[0]) source(r.sources[0]);
            }}
          >
            <title>
              {shortDate(r.date)} · X {fmt(r.x)} {pair.xUnit} · Y {fmt(r.y)} {pair.yUnit}
            </title>
          </circle>
        ))}
        <text x="680" y="296" textAnchor="end" fill="#2688ed" fontSize="16">
          X · {pair.xUnit}
        </text>
      </svg>
      <small>หนึ่งจุด = หนึ่งวันที่ข้อมูลทั้งสองชุดครบและอนุมัติแล้ว · {rows.length} คู่</small>
    </div>
  );
}
export function ParameterChart({
  plot,
  samples,
  source,
}: {
  plot: Row;
  samples: Row[];
  source: (id: string) => void;
}) {
  const max = plot.code === 'PH' ? 14 : Math.max(1, plot.upper, ...samples.map((r) => r.value ?? 0)) * 1.15;
  const x = (i: number) => 72 + (i * 616) / Math.max(1, samples.length - 1),
    y = (v: number) => 252 - (v / max) * 205;
  return (
    <svg
      className="data-chart"
      viewBox="0 0 760 302"
      role="img"
      aria-label={'ผลตรวจ ' + plot.name + ' เทียบเส้นเกณฑ์อ้างอิงรอยืนยัน'}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1="72" x2="688" y1={y(max * f)} y2={y(max * f)} stroke="#e8eef4" />
          <text x="62" y={y(max * f) + 4} textAnchor="end" fontSize="16" fill="#65748b">
            {fmt(max * f)}
          </text>
        </g>
      ))}
      {[plot.lower, plot.upper]
        .filter((v) => v !== null)
        .map((v, i) => (
          <g key={i}>
            <line x1="72" x2="688" y1={y(v)} y2={y(v)} stroke="#bf841b" strokeDasharray="6 5" />
            <text x="684" y={y(v) - 6} textAnchor="end" fill="#976411" fontSize="16">
              อ้างอิง {v} {plot.unit} • รอยืนยัน
            </text>
          </g>
        ))}
      {segments(samples, 'value', x, y).map((d, i) => (
        <path key={i} d={d} fill="none" stroke={teal} strokeWidth="2.8" />
      ))}
      {samples.map((r, i) => (
        <g key={r.id}>
          {r.value !== null && (
            <circle
              cx={x(i)}
              cy={y(r.value)}
              r="5"
              fill={r.value > plot.upper || (plot.lower !== null && r.value < plot.lower) ? '#bf841b' : teal}
              stroke="white"
              strokeWidth="2"
              tabIndex={0}
              role="button"
              aria-label={`${r.sample} ${fmt(r.value)} ${plot.unit} เปิดผลตรวจ`}
              onClick={() => source(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') source(r.id);
              }}
            >
              <title>
                {r.sample} · {r.assetName} · {r.raw} · {shortDate(r.date)}
              </title>
            </circle>
          )}
          {(i % Math.max(1, Math.ceil(samples.length / 7)) === 0 || i === samples.length - 1) && (
            <text x={x(i)} y="280" textAnchor="middle" fill="#65748b" fontSize="16">
              {shortDate(r.date)}
            </text>
          )}
        </g>
      ))}
      <text x="12" y="22" fontSize="16" fill="#168b88">
        {plot.unit}
      </text>
    </svg>
  );
}

export function MetricChart({
  rows,
  unit,
  label,
  color = teal,
  source,
}: {
  rows: Row[];
  unit: string;
  label: string;
  color?: string;
  source?: (id: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0), ...rows.map((r) => r.limit ?? 0)) * 1.15;
  const x = (i: number) => 72 + (i * 616) / Math.max(1, rows.length - 1),
    y = (v: number) => 252 - (v / max) * 205;
  return (
    <div className="chart-container">
      <svg
        className="data-chart"
        viewBox="0 0 760 302"
        role="img"
        aria-label={label + ' · ' + unit + ' · ข้อมูลขาดหรือผลิตศูนย์เว้นช่วง'}
      >
        <text x="12" y="22" fontSize="16" fill={color}>
          {unit}
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1="72" x2="688" y1={y(max * f)} y2={y(max * f)} stroke="#e8eef4" />
            <text x="62" y={y(max * f) + 4} textAnchor="end" fontSize="16" fill="#65748b">
              {fmt(max * f, 2)}
            </text>
          </g>
        ))}
        {segments(rows, 'limit', x, y).map((d, i) => (
          <path key={'limit' + i} d={d} fill="none" stroke="#a67420" strokeDasharray="6 5" strokeWidth="2" />
        ))}
        {segments(rows, 'value', x, y).map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth="2.8" />
        ))}
        {rows.map((r, i) => (
          <g key={r.date}>
            {r.value != null && (
              <circle
                cx={x(i)}
                cy={y(r.value)}
                r="4"
                fill={r.aboveTarget ? '#d98644' : color}
                stroke="white"
                strokeWidth="1.5"
                tabIndex={source ? 0 : undefined}
                role={source ? 'button' : undefined}
                aria-label={`${shortDate(r.date)} ${fmt(r.value, 3)} ${unit} เปิดต้นทาง`}
                onClick={() => {
                  const id = r.ySources?.[0] || r.sources?.[0];
                  if (source && id) source(id);
                }}
                onKeyDown={(e) => {
                  const id = r.ySources?.[0] || r.sources?.[0];
                  if (e.key === 'Enter' && source && id) source(id);
                }}
              >
                <title>
                  {shortDate(r.date)} · {fmt(r.value, 3)} {unit}
                  {r.limit != null ? ' · เป้าหมายภายใน ' + r.limit : ''}
                </title>
              </circle>
            )}
            {(i % Math.max(1, Math.ceil(rows.length / 6)) === 0 || i === rows.length - 1) && (
              <text x={x(i)} y="280" textAnchor="middle" fontSize="16" fill="#65748b">
                {shortDate(r.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
export function MiniTrend({
  rows,
  label,
  color = teal,
  upper,
  lower,
}: {
  rows: Row[];
  label: string;
  color?: string;
  upper?: number;
  lower?: number | null;
}) {
  const max = Math.max(1, upper ?? 0, ...rows.map((r) => r.value ?? 0)) * 1.1;
  const x = (i: number) => 5 + (i * 220) / Math.max(1, rows.length - 1),
    y = (n: number) => 65 - (n / max) * 56;
  return (
    <svg className="mini-trend" viewBox="0 0 230 74" role="img" aria-label={'แนวโน้มย่อ ' + label}>
      <line x1="5" x2="225" y1="65" y2="65" stroke="#e6edf3" />
      {[upper, lower]
        .filter((n) => n != null)
        .map((n, i) => (
          <line key={i} x1="5" x2="225" y1={y(n!)} y2={y(n!)} stroke="#c39247" strokeDasharray="4 3" />
        ))}
      {segments(rows, 'value', x, y).map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth="2.4" fill="none" />
      ))}
      {rows.map((r, i) =>
        r.value == null ? null : (
          <circle
            key={i}
            cx={x(i)}
            cy={y(r.value)}
            r="2"
            fill={
              upper != null && (r.value > upper || (lower != null && r.value < lower)) ? '#c39247' : color
            }
          />
        ),
      )}
    </svg>
  );
}
export function WasteStackChart({ composition, source }: { composition: Row; source: (id: string) => void }) {
  const rows = composition.daily,
    max = Math.max(1, ...rows.map((r: Row) => r.total ?? 0)) * 1.15;
  const width = 610 / Math.max(1, rows.length),
    y = (n: number) => 252 - (n / max) * 205;
  return (
    <div className="chart-container">
      <svg
        className="data-chart"
        viewBox="0 0 760 302"
        role="img"
        aria-label="ปริมาณขยะเกิดขึ้นรายวันแยกประเภท ไม่บวกจุดหลักกับจุดย่อยซ้ำ"
      >
        <text x="12" y="22" fontSize="16" fill="#65748b">
          kg / วัน
        </text>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1="72" x2="688" y1={y(max * f)} y2={y(max * f)} stroke="#e8eef4" />
            <text x="62" y={y(max * f) + 4} textAnchor="end" fontSize="16" fill="#65748b">
              {fmt(max * f, 0)}
            </text>
          </g>
        ))}
        {rows.map((r: Row, i: number) => {
          let offset = 0;
          return (
            <g key={r.date}>
              {composition.categories.map((c: Row) => {
                const v = r[c.code];
                if (v == null) return null;
                offset += v;
                return (
                  <rect
                    key={c.code}
                    x={75 + i * width}
                    y={y(offset)}
                    width={Math.max(1, width * 0.7)}
                    height={(v / max) * 205}
                    fill={c.color}
                    tabIndex={0}
                    role="button"
                    aria-label={`${shortDate(r.date)} ${c.name} ${fmt(v)} kg`}
                    onClick={() => r.sources[c.code]?.[0] && source(r.sources[c.code][0])}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && r.sources[c.code]?.[0]) source(r.sources[c.code][0]);
                    }}
                  >
                    <title>
                      {shortDate(r.date)} · {c.name}: {fmt(v)} kg
                    </title>
                  </rect>
                );
              })}
              {(i % Math.max(1, Math.ceil(rows.length / 6)) === 0 || i === rows.length - 1) && (
                <text
                  x={75 + i * width + width * 0.35}
                  y="280"
                  textAnchor="middle"
                  fontSize="16"
                  fill="#65748b"
                >
                  {shortDate(r.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
export function WasteDonut({ composition }: { composition: Row }) {
  let offset = 0;
  return (
    <svg
      viewBox="0 0 220 220"
      className="waste-donut"
      role="img"
      aria-label="สัดส่วนประเภทขยะที่เกิดขึ้น จากยอดที่อนุมัติแล้ว"
    >
      <circle cx="110" cy="110" r="78" fill="none" stroke="#e9eff5" strokeWidth="24" />
      {composition.total > 0 &&
        composition.categories.map((c: Row) => {
          if (c.value == null) return null;
          const length = (c.value / composition.total) * 100,
            previous = offset;
          offset += length;
          return (
            <circle
              key={c.code}
              cx="110"
              cy="110"
              r="78"
              pathLength="100"
              fill="none"
              stroke={c.color}
              strokeWidth="24"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-previous}
              transform="rotate(-90 110 110)"
            />
          );
        })}
      <text x="110" y="109" textAnchor="middle" fill="#203452" fontSize="25" fontWeight="700">
        {fmt(composition.total, 0)}
      </text>
      <text x="110" y="134" textAnchor="middle" fill="#68798e" fontSize="13">
        kg ที่เกิดขึ้น
      </text>
    </svg>
  );
}
