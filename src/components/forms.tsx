'use client';
import { useState, useRef, useEffect } from 'react';
import { Field, Badge, Table, JsonView, Empty, iso, categoryNames, type Row } from './ui';
export type Command = (action: string, input: Row) => Promise<Row>;
export function RecordForm({
  data,
  command,
  done,
  initial,
  defaultCategory,
}: {
  data: Row;
  command: Command;
  done: () => void;
  initial?: Row;
  defaultCategory?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const draftKey = `env-draft-${data.actor.id}-${data.site}-${initial?.id || 'new'}`;
  const [recovered, setRecovered] = useState<Row | null>(null);
  const [category, setCategory] = useState(initial?.category || defaultCategory || 'WATER');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const masters = data.masters.filter((m: Row) => m.status === 'ACTIVE');
  const parameters = masters.filter((m: Row) => m.kind === 'PARAMETER' && m.config.category === category);
  const [param, setParam] = useState(initial?.parameter_code || '');
  const selected = parameters.find((p: Row) => p.code === param) || parameters[0];
  const isLab = selected?.config.kinds?.includes('LAB');
  const assets = masters.filter(
    (m: Row) =>
      m.kind === 'ASSET' &&
      m.config.category === category &&
      (isLab
        ? m.config.measurement_type === 'LAB' || m.code.startsWith('LAB-')
        : m.config.measurement_type !== 'LAB' && !m.code.startsWith('LAB-')),
  );
  const units = masters.filter(
    (m: Row) => m.kind === 'UNIT' && m.config.dimension === selected?.config.dimension,
  );
  useEffect(() => {
    if (initial) return;
    try {
      const value = sessionStorage.getItem(draftKey);
      if (value) {
        const draft = JSON.parse(value);
        setCategory(draft.category || defaultCategory || 'WATER');
        setParam(draft.parameter_code || '');
        setRecovered(draft);
      }
    } catch {
      /* A blocked browser storage does not block entry. */
    }
  }, [draftKey]);
  useEffect(() => {
    if (recovered && formRef.current)
      for (const [key, value] of Object.entries(recovered)) {
        const el = formRef.current.elements.namedItem(key);
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLSelectElement ||
          el instanceof HTMLTextAreaElement
        )
          el.value = String(value ?? '');
      }
  }, [recovered, category]);
  return (
    <form
      ref={formRef}
      onChange={(e) => {
        try {
          sessionStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))));
        } catch {}
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const f = Object.fromEntries(new FormData(e.currentTarget));
        const input = {
          ...f,
          category,
          parameter_code: selected?.code,
          value: f.value === '' ? null : Number(f.value),
          payload: {
            ...initial?.payload,
            received_date: f.received_date || undefined,
            issue_id: f.issue_id || undefined,
            waste_type: category === 'WASTE' ? f.waste_type || undefined : undefined,
          },
        };
        try {
          if (initial) {
            await command(initial.status === 'DRAFT' ? 'record.edit' : 'record.revise', {
              id: initial.id,
              version: initial.lock_version,
              data: input,
              reason: f.reason,
            });
          } else await command('record.create', input);
          sessionStorage.removeItem(draftKey);
          done();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {recovered && (
        <p role="status" className="notice">
          กู้ร่างที่ยังไม่บันทึกของบัญชีนี้แล้ว
        </p>
      )}
      <p className="notice">บันทึกเป็นฉบับร่างก่อน → ส่งตรวจ → ผู้ตรวจคนละคนอนุมัติ → เข้า KPI</p>
      {initial && (
        <p>
          แก้ไขรายการ {initial.id.slice(0, 8)} · <Badge value={initial.status} />
        </p>
      )}
      <div className="form-grid">
        <Field label="หมวดข้อมูล">
          <select
            name="category"
            value={category}
            disabled={!!initial}
            onChange={(e) => {
              setCategory(e.target.value);
              setParam('');
            }}
          >
            {Object.entries(categoryNames)
              .filter(([k]) => !['OTHER', 'DATA_QUALITY'].includes(k))
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </Field>
        <Field label="พารามิเตอร์">
          <select
            name="parameter_code"
            value={selected?.code || ''}
            disabled={!!initial}
            onChange={(e) => setParam(e.target.value)}
          >
            {parameters.map((p: Row) => (
              <option key={p.id} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="มิเตอร์ / จุดวัด / หน่วยผลิต">
          <select
            name="asset_code"
            defaultValue={initial?.asset_code || assets[0]?.code}
            key={selected?.code}
          >
            {assets.map((a: Row) => (
              <option key={a.id} value={a.code}>
                {a.code} • {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="วันที่วัด / วันที่เก็บตัวอย่าง (ค.ศ.)">
          <input
            name="event_date"
            type="date"
            required
            defaultValue={initial ? iso(initial.event_date) : data.to}
          />
        </Field>
        <Field label="ค่าที่วัด" hint="เว้นว่างเพื่อเก็บร่างที่ยังไม่ครบ">
          <input
            name="value"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            defaultValue={initial?.value ?? ''}
          />
        </Field>
        <Field label="หน่วย">
          <select
            name="unit"
            defaultValue={
              initial?.unit ||
              units.find((u: Row) => u.code === assets[0]?.config.unit)?.code ||
              units[0]?.code
            }
            key={selected?.code}
          >
            {units.map((u: Row) => (
              <option key={u.id} value={u.code}>
                {u.code} • {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ชนิดรายการ">
          <select name="kind" key={selected?.code} defaultValue={initial?.kind}>
            {(selected?.config.kinds || []).map((k: string) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        {category === 'WASTE' && (
          <Field
            label="ประเภทขยะ / ของเสีย"
            hint="ถ้าจุดบันทึกกำหนดประเภทไว้แล้ว ให้เลือกชนิดเดียวกัน; ไม่ระบุจะแสดงว่าไม่ทราบประเภท"
          >
            <select name="waste_type" defaultValue={initial?.payload?.waste_type || ''}>
              <option value="">ตามจุดบันทึก / ยังไม่ระบุ</option>
              {masters
                .filter((m: Row) => m.kind === 'WASTE_TYPE')
                .map((m: Row) => (
                  <option key={m.id} value={m.code}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label="แหล่งที่มา">
          <select name="source" defaultValue={initial?.source || 'MANUAL'}>
            <option value="MANUAL">บันทึกจากการวัด</option>
            <option value="DEVICE">อุปกรณ์</option>
            <option value="LAB">ห้องปฏิบัติการ</option>
          </select>
        </Field>
        <Field label="Sample ID / Shipment ID / เลขอ้างอิง">
          <input name="source_ref" defaultValue={initial?.source_ref} />
        </Field>
        <Field label="ค่าดิบผลแล็บ เช่น <5">
          <input name="raw_value" defaultValue={initial?.raw_value} />
        </Field>
        <Field label="Qualifier ของผลแล็บ">
          <select name="qualifier" defaultValue={initial?.qualifier || ''}>
            <option value="">ค่าที่แน่นอน</option>
            {['<', '<=', '>', '>='].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        {category === 'WASTEWATER' && (
          <>
            <Field label="วันที่รับผลแล็บ (ค.ศ.)">
              <input name="received_date" type="date" defaultValue={initial?.payload.received_date} />
            </Field>
            <Field label="เชื่อมผลตรวจซ้ำกับ Issue">
              <select name="issue_id" defaultValue={initial?.payload.issue_id || ''}>
                <option value="">ไม่เชื่อม Issue</option>
                {data.issues
                  .filter((i: Row) => i.category === 'WASTEWATER')
                  .map((i: Row) => (
                    <option key={i.id} value={i.id}>
                      {i.number} • {i.title}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
      </div>
      <Field label="หมายเหตุ / เหตุผลการผลิตเป็นศูนย์">
        <textarea name="note" defaultValue={initial?.note} />
      </Field>
      {initial && initial.status !== 'DRAFT' && (
        <Field label="เหตุผลแก้ไข (สร้าง revision ใหม่)">
          <textarea name="reason" required />
        </Field>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy
          ? 'กำลังบันทึก…'
          : initial && initial.status !== 'DRAFT'
            ? 'สร้าง revision ใหม่'
            : 'บันทึกฉบับร่าง'}
      </button>
    </form>
  );
}
export function IssueForm({
  data,
  command,
  done,
  alert,
  initial,
}: {
  data: Row;
  command: Command;
  done: (r: Row) => void;
  alert?: Row;
  initial?: Row;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          const f = Object.fromEntries(new FormData(e.currentTarget));
          done(
            await command('issue.create', {
              ...f,
              alert_id: alert?.id,
              source_record_id: initial?.source_record_id,
            }),
          );
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {alert && <p className="notice">อ้างอิง Alert: {alert.summary}</p>}
      <Field label="ชื่อประเด็น (10–200 ตัวอักษร)">
        <input
          name="title"
          required
          minLength={10}
          maxLength={200}
          defaultValue={initial?.title || (alert ? 'ตรวจสอบ ' + alert.summary : '')}
        />
      </Field>
      <div className="form-grid">
        <Field label="หมวด">
          <select
            name="category"
            defaultValue={initial?.category || alert?.snapshot?.record?.category || 'WATER'}
          >
            {Object.entries(categoryNames)
              .filter(([k]) => k !== 'PRODUCTION')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </Field>
        <Field label="ระดับความรุนแรง">
          <select name="severity" defaultValue={initial?.severity || alert?.severity || 'MEDIUM'}>
            <option value="LOW">ต่ำ</option>
            <option value="MEDIUM">ปานกลาง</option>
            <option value="HIGH">สูง</option>
            <option value="CRITICAL">วิกฤต</option>
          </select>
        </Field>
        <Field label="วันที่พบ (ค.ศ.)">
          <input name="detected_date" type="date" required defaultValue={initial?.detected_date || data.to} />
        </Field>
      </div>
      <Field label="ข้อเท็จจริง / ผลกระทบ / สิ่งที่ต้องตรวจ">
        <textarea name="description" required rows={4} defaultValue={initial?.description} />
      </Field>
      {initial?.source_record_id && (
        <p className="notice">
          เชื่อมข้อมูลต้นทางที่อนุมัติแล้ว {initial.source_record_id.slice(0, 8)} ·
          ตรวจข้อเท็จจริงและยืนยันก่อนเปิดประเด็น
        </p>
      )}
      {!alert && !initial?.source_record_id && (
        <Field label="เหตุผลที่ยังไม่มีแหล่งข้อมูลอ้างอิง">
          <textarea name="source_reason" required />
        </Field>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        เปิดประเด็น
      </button>
    </form>
  );
}
export function ActionForm({
  action,
  issue,
  data,
  command,
  done,
}: {
  action: string;
  issue: Row;
  data: Row;
  command: Command;
  done: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        const f = Object.fromEntries(new FormData(e.currentTarget));
        const checks = Object.fromEntries(
          (issue.workflow_snapshot?.config.checklist || []).map((c: string) => [c, f[c] === 'on']),
        );
        try {
          await command(action, { ...f, id: issue.id, version: issue.version, checks });
          done();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {action === 'issue.assign' && (
        <>
          <Field label="ผู้รับผิดชอบ">
            <select name="owner_id" defaultValue={issue.owner_id || 'owner'}>
              {data.users
                .filter((u: Row) => u.active && u.roles.some((r: string) => ['EO', 'DO', 'ES'].includes(r)))
                .map((u: Row) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="ผู้ตรวจอิสระ">
            <select name="verifier_id" defaultValue={issue.verifier_id || 'es2'}>
              {data.users
                .filter((u: Row) => u.roles.includes('ES') && u.id !== issue.created_by)
                .map((u: Row) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="กำหนดเสร็จ (สิ้นวันตามเวลา Site)">
            <input name="due_date" type="date" required defaultValue={iso(issue.due_date) || data.to} />
          </Field>
          {issue.owner_id && (
            <Field label="เหตุผลมอบหมายใหม่ / เลื่อนกำหนด">
              <textarea name="reason" required />
            </Field>
          )}
        </>
      )}
      {action === 'task.add' && (
        <>
          <Field label="รายละเอียด Action">
            <textarea name="description" required />
          </Field>
          <Field label="ผู้รับผิดชอบ Action">
            <select name="owner_id" defaultValue={issue.owner_id}>
              {data.users
                .filter(
                  (u: Row) =>
                    u.active &&
                    u.id !== issue.verifier_id &&
                    u.roles.some((r: string) => ['EO', 'DO', 'ES'].includes(r)),
                )
                .map((u: Row) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="กำหนดเสร็จ">
            <input name="due_date" type="date" required defaultValue={iso(issue.due_date)} />
          </Field>
        </>
      )}
      {action === 'issue.plan' && (
        <>
          <Field label="สาเหตุ หรือ “ยังไม่ยืนยัน” พร้อมเหตุผล">
            <textarea name="root_cause" required />
          </Field>
          <Field label="Action ที่ต้องดำเนินการ">
            <textarea name="description" required />
          </Field>
        </>
      )}
      {action === 'issue.verify' && (
        <fieldset>
          <legend>ตรวจหลักฐานและเงื่อนไขให้ครบทุกข้อ</legend>
          {(issue.workflow_snapshot.config.checklist || []).map((c: string) => (
            <label className="check" key={c}>
              <input type="checkbox" name={c} required />
              {c}
            </label>
          ))}
        </fieldset>
      )}
      {!['issue.assign', 'issue.plan', 'task.add'].includes(action) && (
        <Field
          label={
            ['issue.reject', 'issue.reopen', 'issue.cancel'].includes(action)
              ? 'เหตุผลและสิ่งที่ต้องแก้ไข / ข้อค้นพบใหม่'
              : 'บันทึกผล / สรุปการดำเนินการ'
          }
        >
          <textarea
            name={['issue.reject', 'issue.reopen', 'issue.cancel'].includes(action) ? 'reason' : 'note'}
            required
            rows={4}
          />
        </Field>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? 'กำลังบันทึก…' : 'ยืนยันการดำเนินการ'}
      </button>
    </form>
  );
}
export function EvidenceForm({
  issue,
  record,
  command,
  done,
}: {
  issue?: Row;
  record?: Row;
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
        const f = new FormData(e.currentTarget);
        const file = f.get('file') as File;
        try {
          const buffer = await file.arrayBuffer();
          let binary = '';
          new Uint8Array(buffer).forEach((b) => (binary += String.fromCharCode(b)));
          await command('evidence.upload', {
            issue_id: issue?.id,
            record_id: record?.id,
            version: issue?.version,
            filename: file.name,
            mime: file.type,
            base64: btoa(binary),
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
        หลักฐานเก็บแยกจากเว็บ และตรวจสิทธิ์ทุกครั้งที่ดาวน์โหลด · PDF / PNG / JPG ไม่เกิน 8 MB
      </p>
      <Field label="เลือกไฟล์หลักฐาน">
        <input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required />
      </Field>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? 'กำลังจัดเก็บ…' : 'แนบหลักฐาน'}
      </button>
    </form>
  );
}
export function ImportPage({ data, command }: { data: Row; command: Command }) {
  const [csv, setCsv] = useState(''),
    [filename, setFilename] = useState('import.csv'),
    [workbook, setWorkbook] = useState(''),
    [sheets, setSheets] = useState<string[]>([]),
    [sheet, setSheet] = useState(''),
    [batch, setBatch] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<Row[]>(data.jobs || []);
  const loadBatch = async (id: string) => {
    const res = await fetch(`/api/imports/${encodeURIComponent(id)}?site=${encodeURIComponent(data.site)}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    setBatch(body);
  };
  useEffect(() => {
    const abort = new AbortController();
    const refresh = async () => {
      try {
        const res = await fetch('/api/jobs?site=' + encodeURIComponent(data.site), { signal: abort.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setJobs(body.jobs);
        if (batch?.id && ['PREPARING', 'IMPORTING'].includes(batch.status)) await loadBatch(batch.id);
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      }
    };
    const timer = setInterval(refresh, 2000);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [data.site, batch?.id, batch?.status]);
  return (
    <div className="stack">
      <div className="panel">
        <div className="steps">
          <b>1 เลือกไฟล์</b>
          <span>2 ตรวจรูปแบบ / Mapping</span>
          <span>3 Preview</span>
          <span>4 ยืนยันร่าง</span>
        </div>
        <p>
          นำเข้า CSV UTF-8 หรือ XLSX ไม่เกิน 50,000 แถวต่อชุด · งานตรวจและนำเข้าทำเบื้องหลัง · ผลนำเข้าเป็น
          DRAFT
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const queued = await command('import.enqueue', {
                csv,
                workbook: workbook || undefined,
                sheet: sheet || undefined,
                filename,
                dateFormat: f.dateFormat,
                calendar: f.calendar,
                mapping: JSON.parse(String(f.mapping || '{}')),
              });
              await loadBatch(queued.batch_id);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="ไฟล์ CSV / XLSX">
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setError('');
                setFilename(f.name);
                setBatch(null);
                setWorkbook('');
                setSheets([]);
                setCsv('');
                try {
                  if (f.name.toLowerCase().endsWith('.xlsx')) {
                    if (f.size > 10 * 1024 * 1024) throw new Error('ไฟล์ใหญ่เกิน 10 MB');
                    let binary = '';
                    new Uint8Array(await f.arrayBuffer()).forEach((b) => (binary += String.fromCharCode(b)));
                    const encoded = btoa(binary);
                    const result = await command('import.inspect', { workbook: encoded });
                    setWorkbook(encoded);
                    setSheets(result.sheets);
                    setSheet(result.sheets[0]);
                  } else {
                    if (f.size > 20 * 1024 * 1024) throw new Error('CSV ใหญ่เกิน 20 MB');
                    setCsv(await f.text());
                  }
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </Field>
          {sheets.length > 0 && (
            <Field label="เลือก Sheet">
              <select value={sheet} onChange={(e) => setSheet(e.target.value)}>
                {sheets.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          )}
          <div className="form-grid">
            <Field label="รูปแบบวันที่">
              <select name="dateFormat">
                <option value="ISO">YYYY-MM-DD</option>
                <option value="DMY">DD/MM/YYYY</option>
                <option value="MDY">MM/DD/YYYY</option>
              </select>
            </Field>
            <Field label="ปฏิทินต้นทาง">
              <select name="calendar">
                <option value="CE">ค.ศ.</option>
                <option value="BE">พ.ศ.</option>
              </select>
            </Field>
          </div>
          <Field
            label="Mapping คอลัมน์ (ชื่อมาตรฐาน → ชื่อในไฟล์)"
            hint={'เช่น {"event_date":"วันที่","value":"ค่า"} ใช้ {} เมื่อหัวตารางตรงมาตรฐาน'}
          >
            <textarea name="mapping" defaultValue="{}" rows={2} />
          </Field>
          <details>
            <summary>ดูแม่แบบ CSV</summary>
            <pre className="json">
              category,asset_code,parameter_code,event_date,value,unit,kind,source_ref,note{'\n'}
              WATER,W-MAIN,WATER_USE,{data.to},150,m3,CONSUMED,,ข้อมูลตัวอย่าง
            </pre>
            <a
              className="text-link"
              href={
                'data:text/csv;charset=utf-8,' +
                encodeURIComponent(
                  'category,asset_code,parameter_code,event_date,value,unit,kind,source_ref,note\nWATER,W-MAIN,WATER_USE,' +
                    data.to +
                    ',150,m3,CONSUMED,,Demo\n',
                )
              }
              download="environment-template.csv"
            >
              ดาวน์โหลดแม่แบบ
            </a>
          </details>
          <button className="button" disabled={(!csv && !workbook) || busy}>
            ตรวจไฟล์และแสดง Preview
          </button>
        </form>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {batch && (
        <div className="panel">
          <h2>
            {batch.filename} <Badge value={batch.status} />
          </h2>
          <p>
            ผ่าน {batch.valid ?? batch.rows.filter((r: Row) => !r.error).length} / ตรวจแล้ว{' '}
            {batch.total ?? batch.rows.length} แถว · แสดงตัวอย่างไม่เกิน 200 แถว
          </p>
          <a className="text-link" href={`/api/imports/${batch.id}?site=${data.site}&errors=1`}>
            ดาวน์โหลดแถวที่ผิดพลาด CSV
          </a>
          <Table headers={['แถว', 'วันที่', 'ค่า / หน่วย', 'ผลตรวจ']}>
            {batch.rows.map((r: Row) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>{r.data.event_date}</td>
                <td>
                  {r.data.value} {r.data.unit}
                </td>
                <td>{r.error || '✓ ผ่าน'}</td>
              </tr>
            ))}
          </Table>
          {batch.status === 'PREVIEW' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                const allowPartial = new FormData(e.currentTarget).get('partial') === 'on';
                try {
                  await command('import.queue-confirm', { id: batch.id, allowPartial });
                  await loadBatch(batch.id);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="check">
                <input name="partial" type="checkbox" />
                ยืนยันนำเข้าเฉพาะแถวที่ผ่าน และข้ามแถวที่ผิดพลาด
              </label>
              <button className="button" disabled={busy}>
                ยืนยันนำเข้าเป็นฉบับร่าง
              </button>
            </form>
          )}
          {batch.result && <JsonView value={batch.result} />}
        </div>
      )}
      <div className="panel">
        <h2>ประวัตินำเข้า</h2>
        {data.imports?.map((b: Row) => (
          <button
            key={b.id}
            className="list-button"
            onClick={() => void loadBatch(b.id).catch((e) => setError(e.message))}
          >
            {b.filename}
            <Badge value={b.status} />
          </button>
        ))}
      </div>
      <div className="panel">
        <h2>งานเบื้องหลังของฉัน</h2>
        {jobs.length ? (
          jobs.map((j) => (
            <div key={j.id} className="list-button">
              <span>
                {j.kind === 'IMPORT_PREVIEW' ? 'ตรวจไฟล์' : 'นำเข้าร่าง'} · {j.cursor}/{j.total} · {j.status}
                {j.error && <small className="error">{j.error}</small>}
              </span>
              {j.status === 'FAILED' && (
                <button
                  className="text-link"
                  onClick={() => void command('import.retry', { id: j.id }).catch((e) => setError(e.message))}
                >
                  ลองใหม่หลังแก้สาเหตุ
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty text="ยังไม่มีงานนำเข้า" />
        )}
      </div>
    </div>
  );
}
