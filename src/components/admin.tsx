'use client';
import { useState } from 'react';
import { Plus, Settings2, ShieldCheck, History } from 'lucide-react';
import { Badge, Field, Modal, Table, JsonView, shortDate, iso, type Row } from './ui';
import type { Command } from './forms';
const kinds: Record<string, string> = {
  SITE: 'โรงงาน',
  DEPARTMENT: 'แผนก',
  AREA: 'พื้นที่',
  ASSET: 'มิเตอร์ / จุดวัด',
  PARAMETER: 'พารามิเตอร์',
  UNIT: 'หน่วย',
  PRODUCTION_UNIT: 'หน่วยผลิต',
  PRODUCT: 'ผลิตภัณฑ์',
  WASTE_TYPE: 'ประเภทของเสีย',
  SCHEDULE: 'ตารางคาดหวัง',
  CALENDAR: 'ปฏิทิน',
  EXEMPTION: 'ข้อยกเว้นตาราง',
  COUNTER_RESET: 'มิเตอร์ Reset',
  CHECKLIST: 'รายการตรวจ',
  WORKFLOW: 'สายอนุมัติ',
  RULE: 'เกณฑ์และกฎ',
  INTENSITY_TARGET: 'เป้าหมายประสิทธิภาพต่อผลผลิต',
};
const configFields: Record<string, Array<[string, string, string]>> = {
  UNIT: [
    ['dimension', 'มิติ เช่น volume / energy / mass / production_mass', 'text'],
    ['factor', 'ตัวคูณเทียบหน่วยฐาน', 'number'],
    ['base', 'รหัสหน่วยฐาน', 'text'],
  ],
  PARAMETER: [
    ['category', 'หมวด WATER / WASTEWATER / ENERGY / WASTE / PRODUCTION', 'text'],
    ['dimension', 'มิติหน่วย', 'text'],
  ],
  ASSET: [
    ['category', 'หมวดข้อมูล', 'text'],
    ['unit', 'หน่วย', 'text'],
    ['mode', 'ชนิด INTERVAL / CUMULATIVE', 'text'],
    ['boundary', 'การรวม INCLUDED / BREAKDOWN / EXCLUDED', 'text'],
    ['parent', 'รหัสมิเตอร์แม่ (ถ้ามี)', 'text'],
    ['multiplier', 'ตัวคูณมิเตอร์', 'number'],
    ['waste_type', 'รหัสประเภทของเสีย (ถ้ามี)', 'text'],
  ],
  PRODUCTION_UNIT: [['unit', 'รหัสหน่วยผลิต', 'text']],
  WASTE_TYPE: [['classification', 'ประเภทหลัก GENERAL / HAZARDOUS / RECYCLE', 'text']],
  INTENSITY_TARGET: [
    ['category', 'หมวด WATER / WASTEWATER / ENERGY / WASTE', 'text'],
    ['resource_unit', 'หน่วยฐานทรัพยากร m3 / kWh / kg', 'text'],
    ['production_unit', 'หน่วยฐานผลผลิต t / piece', 'text'],
    ['limit', 'เป้าหมายสูงสุดต่อหน่วยผลิต', 'number'],
    ['reference', 'ที่มาและขอบเขตเป้าหมายภายใน', 'text'],
  ],
  SCHEDULE: [
    ['category', 'หมวดข้อมูล', 'text'],
    ['asset', 'รหัสจุดวัด / หน่วยผลิต', 'text'],
    ['parameter', 'รหัสพารามิเตอร์', 'text'],
    ['kind', 'ชนิดข้อมูล เช่น CONSUMED', 'text'],
    ['frequency', 'ความถี่ DAILY / WEEKLY', 'text'],
    ['weekday', 'วันประจำสัปดาห์ 0=อาทิตย์ ถึง 6=เสาร์', 'number'],
    ['due', 'เวลาครบกำหนดส่ง', 'time'],
    ['calendar', 'รหัสปฏิทิน', 'text'],
  ],
  EXEMPTION: [
    ['schedule', 'รหัสตารางคาดหวัง', 'text'],
    ['reason', 'เหตุผลยกเว้น', 'text'],
  ],
  COUNTER_RESET: [
    ['asset', 'รหัสมิเตอร์', 'text'],
    ['consumption', 'ปริมาณช่วง reset ที่ตรวจยืนยันแล้ว', 'number'],
    ['reference', 'แหล่งอ้างอิง / หลักฐาน', 'text'],
  ],
  RULE: [
    ['parameter', 'รหัสพารามิเตอร์', 'text'],
    ['asset', 'จุดวัดที่ใช้เกณฑ์ (ว่าง=ทุกจุด)', 'text'],
    ['kind', 'ชนิดข้อมูล (ว่าง=ทุกชนิด)', 'text'],
    ['unit', 'หน่วยเกณฑ์', 'text'],
    ['operator', 'เงื่อนไข > / >= / < / <= / between', 'text'],
    ['threshold', 'ค่าเกณฑ์ / ค่าต่ำสุด', 'number'],
    ['upper', 'ค่าสูงสุด (เฉพาะ between)', 'number'],
    ['severity', 'ความรุนแรง LOW / MEDIUM / HIGH / CRITICAL', 'text'],
    ['reference', 'แหล่งอ้างอิงและขอบเขตการใช้', 'text'],
  ],
};
function MasterForm({
  data,
  kind,
  initial,
  command,
  done,
}: {
  data: Row;
  kind: string;
  initial?: Row;
  command: Command;
  done: () => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const f = Object.fromEntries(new FormData(e.currentTarget));
        try {
          let config = { ...initial?.config, ...JSON.parse(String(f.extra || '{}')) };
          for (const [key, , type] of configFields[kind] || [])
            config[key] = type === 'number' ? (f[key] === '' ? null : Number(f[key])) : f[key];
          if (kind === 'RULE') config.regulatory = f.regulatory === 'on';
          if (kind === 'WORKFLOW') {
            config.reviewers = data.users
              .filter((u: Row) => f['reviewer_' + u.id] === 'on')
              .map((u: Row) => u.id);
            config.checklist = String(f.checklist).split('\n').filter(Boolean);
          }
          if (kind === 'CALENDAR') {
            config.weekdays = String(f.weekdays).split(',').map(Number);
            config.holidays = String(f.holidays)
              .split(/\s*,\s*/)
              .filter(Boolean);
          }
          await command(initial?.status === 'DRAFT' ? 'master.edit' : 'master.save', {
            id: initial?.id,
            kind,
            code: f.code || initial?.code,
            name: f.name,
            effective_from: f.effective_from,
            effective_to: f.effective_to,
            config,
          });
          done();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="notice">
        ฉบับร่าง → ส่งตรวจ → ผู้ตรวจคนละคนอนุมัติ · รุ่นใหม่จะไม่เปลี่ยนข้อมูลที่อนุมัติในอดีต
      </p>
      <div className="form-grid">
        <Field label="รหัสคงที่">
          <input name="code" required defaultValue={initial?.code} readOnly={!!initial} />
        </Field>
        <Field label="ชื่อ">
          <input name="name" required defaultValue={initial?.name} />
        </Field>
        <Field label="วันที่เริ่มมีผล (ค.ศ.)">
          <input
            name="effective_from"
            type="date"
            required
            defaultValue={initial?.status === 'DRAFT' ? iso(initial.effective_from) : data.to}
          />
        </Field>
        <Field label="วันสิ้นสุด (บังคับสำหรับข้อยกเว้น)">
          <input
            name="effective_to"
            type="date"
            required={kind === 'EXEMPTION'}
            defaultValue={initial?.effective_to ? iso(initial.effective_to) : ''}
          />
        </Field>
      </div>
      <div className="form-grid">
        {(configFields[kind] || []).map(([key, label, type]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              type={type}
              step={type === 'number' ? 'any' : undefined}
              defaultValue={initial?.config?.[key] ?? ''}
            />
          </Field>
        ))}
      </div>
      {kind === 'RULE' && (
        <label className="check">
          <input name="regulatory" type="checkbox" defaultChecked={initial?.config.regulatory} />
          เป็นเกณฑ์กฎหมาย (ต้องยืนยันขอบเขตและแหล่งอ้างอิงก่อนเปิดใช้)
        </label>
      )}
      {kind === 'WORKFLOW' && (
        <>
          <fieldset>
            <legend>ผู้ตรวจที่มีสิทธิ์ใน Site นี้</legend>
            {data.users
              .filter((u: Row) => u.roles.includes('ES'))
              .map((u: Row) => (
                <label className="check" key={u.id}>
                  <input
                    name={'reviewer_' + u.id}
                    type="checkbox"
                    defaultChecked={initial?.config.reviewers?.includes(u.id)}
                  />
                  {u.name}
                </label>
              ))}
          </fieldset>
          <Field label="Checklist ที่บังคับ (หนึ่งข้อต่อบรรทัด)">
            <textarea
              name="checklist"
              required
              defaultValue={
                initial?.config.checklist?.join('\n') || 'ตรวจ Action ครบ\nตรวจหลักฐาน\nผู้ตรวจแยกจากผู้ทำ'
              }
            />
          </Field>
        </>
      )}
      {kind === 'CALENDAR' && (
        <>
          <Field label="วันทำงาน (0–6 คั่นด้วย ,)">
            <input name="weekdays" defaultValue={initial?.config.weekdays?.join(',') || '0,1,2,3,4,5,6'} />
          </Field>
          <Field label="วันหยุด ISO (คั่นด้วย ,)">
            <input name="holidays" defaultValue={initial?.config.holidays?.join(',')} />
          </Field>
        </>
      )}
      <details>
        <summary>การตั้งค่าเพิ่มเติม (JSON)</summary>
        <Field label="คุณสมบัติเพิ่มเติม เช่น kinds, evidence_required">
          <textarea name="extra" defaultValue={JSON.stringify(initial?.config || {}, null, 2)} rows={5} />
        </Field>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        บันทึกฉบับร่าง
      </button>
    </form>
  );
}
export function AdminMasters({
  data,
  command,
  rulesOnly = false,
}: {
  data: Row;
  command: Command;
  rulesOnly?: boolean;
}) {
  const [kind, setKind] = useState(rulesOnly ? 'RULE' : 'ASSET');
  const [edit, setEdit] = useState<Row | boolean | null>(null);
  const [error, setError] = useState('');
  const [approve, setApprove] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);
  const rows = data.masters.filter((m: Row) => m.kind === kind);
  const latest = rows.filter((r: Row, i: number, a: Row[]) => a.findIndex((x) => x.code === r.code) === i);
  const act = async (action: string, input: Row) => {
    setError('');
    try {
      await command(action, input);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="stack">
      {rulesOnly && (
        <p className="notice amber">
          เกณฑ์เริ่มต้นยังไม่ใช่ข้อกำหนดกฎหมายที่ยืนยัน · กฎชื่อ Demo ใช้ทดสอบ workflow เท่านั้น
        </p>
      )}
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <Settings2 size={19} /> {kinds[kind]}
            </h2>
            <p>ตั้งค่าที่มีผลตามรุ่นและช่วงเวลา</p>
          </div>
          <button className="button" onClick={() => setEdit(true)}>
            <Plus size={16} />
            เพิ่มฉบับร่าง
          </button>
        </div>
        {!rulesOnly && (
          <div className="tabs">
            {Object.entries(kinds)
              .filter(([k]) => k !== 'RULE')
              .map(([k, v]) => (
                <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
                  {v}
                </button>
              ))}
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Table headers={['รหัส / ชื่อ', 'รุ่น / วันที่มีผล', 'สถานะ', 'การดำเนินการ']}>
          {latest.map((r: Row) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name}</strong>
                <small>{r.code}</small>
              </td>
              <td>
                v{r.version}
                <small>{shortDate(r.effective_from)}</small>
              </td>
              <td>
                <Badge value={r.status} />
              </td>
              <td>
                <div className="row-actions">
                  {(r.status !== 'DRAFT' || r.created_by === data.actor.id) && (
                    <button className="text-link" onClick={() => setEdit(r)}>
                      {r.status === 'DRAFT' ? 'แก้ร่าง' : 'สร้างรุ่นใหม่'}
                    </button>
                  )}
                  {r.status === 'DRAFT' && r.created_by === data.actor.id && (
                    <button className="text-link" onClick={() => act('master.submit', { id: r.id })}>
                      ส่งตรวจ
                    </button>
                  )}
                  {r.status === 'SUBMITTED' &&
                    r.created_by !== data.actor.id &&
                    data.permissions.includes('review') && (
                      <button className="text-link" onClick={() => setApprove(r)}>
                        ตรวจอนุมัติ
                      </button>
                    )}
                  <button
                    className="icon-button"
                    aria-label={'ดูประวัติ ' + r.code}
                    onClick={() => setHistory(r)}
                  >
                    <History size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </div>
      {edit && (
        <Modal
          title={`${typeof edit === 'object' ? 'แก้ไข / สร้างรุ่นใหม่' : 'เพิ่ม'} ${kinds[kind]}`}
          close={() => setEdit(null)}
        >
          <MasterForm
            kind={kind}
            initial={typeof edit === 'object' ? edit : undefined}
            data={data}
            command={command}
            done={() => setEdit(null)}
          />
        </Modal>
      )}
      {approve && (
        <Modal title="ทบทวนและเปิดใช้เกณฑ์ / Master" close={() => setApprove(null)}>
          <h3>{approve.name}</h3>
          <JsonView value={approve.config} />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const legal = new FormData(e.currentTarget).get('legal') === 'on';
              try {
                await command('master.approve', { id: approve.id, confirmLegal: legal });
                setApprove(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {approve.config.regulatory && (
              <label className="check">
                <input name="legal" type="checkbox" required />
                ยืนยันว่าทบทวนกฎหมาย แหล่งอ้างอิง และการใช้กับ Site นี้แล้ว
              </label>
            )}
            <button className="button">
              <ShieldCheck size={16} />
              อนุมัติและเปิดใช้
            </button>
          </form>
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
      {history && (
        <Modal title={'ประวัติ ' + history.name} close={() => setHistory(null)}>
          {rows
            .filter((r: Row) => r.code === history.code)
            .map((r: Row) => (
              <details key={r.id} open>
                <summary>
                  รุ่น {r.version} · {r.status} · {shortDate(r.effective_from)}
                </summary>
                <JsonView value={r.config} />
              </details>
            ))}
        </Modal>
      )}
    </div>
  );
}
export function AdminUsers({ data, command }: { data: Row; command: Command }) {
  const [edit, setEdit] = useState<Row | null>(null);
  const [error, setError] = useState('');
  return (
    <div className="panel">
      <div className="panel-heading">
        <h2>สมาชิกที่ได้รับสิทธิ์ใน Site</h2>
        <button className="button" onClick={() => setEdit({})}>
          <Plus size={16} />
          เพิ่มผู้ใช้ที่อนุญาต
        </button>
      </div>
      <Table headers={['ผู้ใช้', 'อีเมล', 'บทบาท', 'จัดการ']}>
        {data.users.map((u: Row) => (
          <tr key={u.id}>
            <td>
              {u.name}
              {u.demo && <small>Demo</small>}
            </td>
            <td>{u.email}</td>
            <td>{u.roles.join(' · ')}</td>
            <td>
              {u.id !== data.actor.id && (
                <button className="text-link" onClick={() => setEdit(u)}>
                  แก้สิทธิ์
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Modal title="จัดการผู้ใช้และสิทธิ์ใน Site" close={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              const f = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await command('user.save', {
                  id: edit.id,
                  name: f.name,
                  email: f.email,
                  roles: ['EO', 'DO', 'ES', 'MG', 'SA', 'AV'].filter((r) => f[r] === 'on'),
                  reason: f.reason,
                });
                setEdit(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <Field label="ชื่อผู้ใช้">
              <input name="name" required defaultValue={edit.name} />
            </Field>
            <Field label="อีเมล Google ที่อนุญาต">
              <input name="email" type="email" required defaultValue={edit.email} readOnly={!!edit.id} />
            </Field>
            <fieldset>
              <legend>บทบาท (SA ไม่ได้สิทธิ์อ่านข้อมูลธุรกิจโดยอัตโนมัติ)</legend>
              {['EO', 'DO', 'ES', 'MG', 'SA', 'AV'].map((r) => (
                <label className="check" key={r}>
                  <input name={r} type="checkbox" defaultChecked={edit.roles?.includes(r)} />
                  {r}
                </label>
              ))}
            </fieldset>
            <Field label="เหตุผลเปลี่ยนสิทธิ์">
              <textarea name="reason" required />
            </Field>
            {error && <p className="error">{error}</p>}
            <button className="button">บันทึกและเพิกถอน Session เก่า</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function AdminSites({ data, command }: { data: Row; command: Command }) {
  const [edit, setEdit] = useState<Row | null>(null),
    [error, setError] = useState('');
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>{data.organization.name}</h2>
          <p>แสดง Site ที่บัญชีนี้ได้รับสิทธิ์ สร้าง Site แล้วตั้งค่าผู้ใช้และ Master ก่อนเริ่มบันทึก</p>
        </div>
        <button
          className="button"
          onClick={() => {
            setEdit({ timezone: 'Asia/Bangkok' });
            setError('');
          }}
        >
          เพิ่ม Site
        </button>
      </div>
      <Table headers={['รหัส', 'ชื่อ', 'เขตเวลา', 'จัดการ']}>
        {data.sites.map((s: Row) => (
          <tr key={s.id}>
            <td>
              {s.code}
              {s.demo && <small>Demo</small>}
            </td>
            <td>{s.name}</td>
            <td>{s.timezone}</td>
            <td>
              {s.id === data.site && (
                <button
                  className="text-link"
                  onClick={() => {
                    setEdit(s);
                    setError('');
                  }}
                >
                  แก้ไข Site
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {edit && (
        <Modal title={edit.id ? 'แก้ไข Site' : 'เพิ่ม Site ในองค์กร'} close={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await command(edit.id ? 'site.update' : 'site.create', f);
                setEdit(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            {!edit.id && (
              <Field label="รหัส Site">
                <input name="code" required pattern="[A-Za-z0-9_-]{1,60}" />
              </Field>
            )}
            <Field label="ชื่อ Site">
              <input name="name" required defaultValue={edit.name} />
            </Field>
            <Field label="เขตเวลา IANA">
              <input name="timezone" required defaultValue={edit.timezone} />
            </Field>
            <Field label="เหตุผล">
              <textarea name="reason" required />
            </Field>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="button">บันทึก Site</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
