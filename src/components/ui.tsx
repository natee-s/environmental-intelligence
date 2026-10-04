'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X, ArrowUpRight, Inbox } from 'lucide-react';
import Link from 'next/link';
export type Row = Record<string, any>;
export const categoryNames: Record<string, string> = {
  WATER: 'น้ำใช้',
  WASTEWATER: 'น้ำเสีย',
  ENERGY: 'พลังงาน',
  WASTE: 'ขยะและของเสีย',
  PRODUCTION: 'การผลิต',
  DATA_QUALITY: 'คุณภาพข้อมูล',
  OTHER: 'อื่น ๆ',
};
export const statusNames: Record<string, string> = {
  DRAFT: 'ฉบับร่าง',
  SUBMITTED: 'รอตรวจข้อมูล',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ส่งกลับแก้ไข',
  SUPERSEDED: 'รุ่นก่อนหน้า',
  VOIDED: 'ยกเลิกค่า',
  ACTIVE: 'ใช้งาน',
  INACTIVE: 'ปิดใช้งาน',
  OPEN: 'เปิดประเด็น',
  ASSIGNED: 'มอบหมายแล้ว',
  INVESTIGATING: 'กำลังตรวจสอบ',
  ACTION_IN_PROGRESS: 'กำลังแก้ไข',
  WAITING_VERIFICATION: 'รอตรวจผลงาน',
  VERIFIED: 'ตรวจสอบผ่าน',
  CLOSED: 'ปิดงานแล้ว',
  REOPENED: 'เปิดงานใหม่',
  CANCELLED: 'ยกเลิก',
  NEW: 'แจ้งเตือนใหม่',
  ACKNOWLEDGED: 'รับทราบแล้ว',
  LINKED: 'เชื่อมกับ Issue',
  DISMISSED: 'ยกเลิกแจ้งเตือน',
  RESOLVED: 'จัดการแล้ว',
  TODO: 'ยังไม่เริ่ม',
  IN_PROGRESS: 'กำลังทำ',
  DONE: 'ทำเสร็จแล้ว',
  HIGH: 'สูง',
  CRITICAL: 'วิกฤต',
  MEDIUM: 'ปานกลาง',
  LOW: 'ต่ำ',
  IN_REVIEW: 'รอตรวจรายงาน',
  PUBLISHED: 'เผยแพร่ภายใน',
  PASS: 'ผ่านเกณฑ์ที่ประเมิน',
  EXCEED: 'เกินเกณฑ์',
  INDETERMINATE: 'ยังตัดสินไม่ได้',
  NOT_EVALUATED: 'ยังไม่มีเกณฑ์',
  COMPLETE: 'ข้อมูลครบ',
  PARTIAL: 'ข้อมูลบางส่วน',
  NO_DATA: 'ยังไม่มีข้อมูล',
  UNCONFIGURED: 'ยังไม่ตั้งตาราง',
  PREVIEW: 'ตรวจตัวอย่าง',
  COMPLETED: 'นำเข้าแล้ว',
};
export const fmt = (v: unknown, decimals = 1) =>
  v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('th-TH', { maximumFractionDigits: decimals });
export const shortDate = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : '—';
export const iso = (v: unknown) => String(v || '').slice(0, 10);
export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value.toLowerCase()}`}>{statusNames[value] || value}</span>;
}
export function Empty({
  text = 'ยังไม่มีรายการในพื้นที่นี้',
  href,
  label = 'เพิ่มข้อมูล',
}: {
  text?: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <strong>{text}</strong>
      <p>ข้อมูลที่ยังไม่มีจะไม่ถูกแทนค่าด้วยศูนย์</p>
      {href && (
        <Link className="button secondary" href={href}>
          {label}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null),
    dirty = useRef(false);
  const requestClose = () => {
    if (!dirty.current || window.confirm('มีข้อมูลที่ยังไม่บันทึก ต้องการออกจากฟอร์มนี้หรือไม่?')) close();
  };
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      el?.close();
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onChange={() => {
        dirty.current = true;
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      className="modal"
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" onClick={requestClose} aria-label="ปิดหน้าต่าง">
          <X size={21} />
        </button>
      </header>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function JsonView({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Trend({ series, color = '#087f75', unit }: { series: Row[]; color?: string; unit: string }) {
  const max = Math.max(1, ...series.map((s) => s.value ?? 0)) * 1.15;
  const width = 660,
    height = 180;
  const x = (i: number) => 45 + (i * (width - 65)) / Math.max(1, series.length - 1);
  const y = (n: number) => height - 25 - (n / max) * (height - 45);
  let path = '';
  series.forEach((s, i) => {
    if (s.value !== null)
      path += `${i === 0 || series[i - 1].value === null ? 'M' : 'L'}${x(i)},${y(s.value)} `;
  });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`แนวโน้ม ${unit} ข้อมูลขาดแสดงเป็นช่องว่าง`}
    >
      <text x="8" y="14" className="chart-label">
        {unit}
      </text>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1="45" x2="640" y1={y(max * f)} y2={y(max * f)} stroke="#e7ece9" strokeDasharray="4 4" />
          <text x="0" y={y(max * f) + 4} className="chart-label">
            {fmt(max * f, 0)}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      {series.map((s, i) => (
        <g key={s.date}>
          {s.value !== null && (
            <circle cx={x(i)} cy={y(s.value)} r="4" fill="white" stroke={color} strokeWidth="2">
              <title>
                {s.date}: {fmt(s.value)} {unit}
              </title>
            </circle>
          )}
          {(i % Math.max(1, Math.ceil(series.length / 7)) === 0 || i === series.length - 1) && (
            <text x={x(i)} y="177" textAnchor="middle" className="chart-label">
              {String(s.date).slice(5)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
