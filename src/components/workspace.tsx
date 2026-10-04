'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Leaf,
  LayoutDashboard,
  Droplets,
  Waves,
  Zap,
  Recycle,
  Database,
  ClipboardCheck,
  Upload,
  AlertTriangle,
  Workflow,
  CheckSquare,
  Paperclip,
  Bell,
  FileBarChart,
  Settings2,
  Users,
  ShieldCheck,
  History,
  Plug,
  Search,
  ChevronDown,
  Plus,
  ArrowUpRight,
  LogOut,
  Menu,
  X,
  RefreshCw,
  Factory,
  Download,
  Check,
  Activity,
} from 'lucide-react';
import {
  Badge,
  Empty,
  Field,
  Modal,
  Table,
  JsonView,
  fmt,
  shortDate,
  iso,
  categoryNames,
  type Row,
} from './ui';
import { RecordForm, IssueForm, ActionForm, EvidenceForm, ImportPage, type Command } from './forms';
import { AdminMasters, AdminUsers, AdminSites } from './admin';
import { Dashboard, RecordsTable, IssueDetail } from './operations';
import { MonthlyAnalysis } from './analysis';
const nav = [
  {
    group: 'พื้นที่ทำงาน',
    items: [
      ['/overview', 'ภาพรวม', LayoutDashboard, 'read'],
      ['/monitoring/water', 'น้ำใช้', Droplets, 'read'],
      ['/monitoring/wastewater', 'น้ำเสีย', Waves, 'read'],
      ['/monitoring/energy', 'พลังงาน', Zap, 'read'],
      ['/monitoring/waste', 'ขยะและของเสีย', Recycle, 'read'],
    ],
  },
  {
    group: 'ข้อมูลและการดำเนินงาน',
    items: [
      ['/data', 'ข้อมูลสิ่งแวดล้อม', Database, 'read'],
      ['/data/production', 'ข้อมูลการผลิต', Factory, 'read'],
      ['/data/imports', 'นำเข้าข้อมูล', Upload, 'entry'],
      ['/data/quality', 'ตรวจสอบข้อมูล', ClipboardCheck, 'read'],
      ['/alerts', 'การแจ้งเตือน', AlertTriangle, 'read'],
      ['/issues', 'ประเด็นและการแก้ไข', Workflow, 'read'],
      ['/tasks', 'งานของฉัน', CheckSquare, 'read'],
      ['/documents', 'หลักฐานและเอกสาร', Paperclip, 'read'],
      ['/reports', 'รายงาน', FileBarChart, 'read'],
      ['/analysis/monthly', 'วิเคราะห์สำหรับประชุม', Activity, 'read'],
    ],
  },
  {
    group: 'การจัดการระบบ',
    items: [
      ['/admin/master-data', 'ข้อมูลหลักและสายอนุมัติ', Settings2, 'config'],
      ['/admin/rules', 'เกณฑ์และกฎ', ShieldCheck, 'config'],
      ['/admin/users', 'ผู้ใช้และสิทธิ์', Users, 'users'],
      ['/admin/sites', 'องค์กรและ Site', Factory, 'users'],
      ['/admin/integrations', 'การเชื่อมต่อ', Plug, 'config'],
      ['/admin/audit', 'ประวัติการเปลี่ยนแปลง', History, 'audit'],
    ],
  },
] as const;
const names: Record<string, string> = {
  '/overview': 'ภาพรวมสิ่งแวดล้อม',
  '/monitoring/water': 'ติดตามการใช้น้ำ',
  '/monitoring/wastewater': 'ติดตามน้ำเสีย',
  '/monitoring/energy': 'ติดตามพลังงาน',
  '/monitoring/waste': 'ติดตามขยะและของเสีย',
  '/data': 'ข้อมูลสิ่งแวดล้อม',
  '/data/production': 'ข้อมูลการผลิต',
  '/data/imports': 'นำเข้าข้อมูล',
  '/data/quality': 'ตรวจสอบและอนุมัติข้อมูล',
  '/alerts': 'การแจ้งเตือน',
  '/issues': 'ประเด็นและการแก้ไข',
  '/issues/new': 'เปิดประเด็นใหม่',
  '/tasks': 'งานของฉัน',
  '/documents': 'หลักฐานและเอกสาร',
  '/reports': 'รายงานสิ่งแวดล้อม',
  '/analysis/monthly': 'วิเคราะห์สำหรับประชุมประจำเดือน',
  '/notifications': 'การแจ้งเตือนของฉัน',
  '/admin/master-data': 'ข้อมูลหลักและสายอนุมัติ',
  '/admin/rules': 'เกณฑ์และกฎแจ้งเตือน',
  '/admin/users': 'ผู้ใช้และสิทธิ์',
  '/admin/sites': 'องค์กรและ Site',
  '/admin/integrations': 'การเชื่อมต่อและสถานะระบบ',
  '/admin/audit': 'ประวัติการเปลี่ยนแปลง',
};
export default function Workspace() {
  return (
    <Suspense fallback={<div className="loading">กำลังเตรียมพื้นที่ทำงาน…</div>}>
      <App />
    </Suspense>
  );
}
function App() {
  const path = usePathname(),
    router = useRouter(),
    params = useSearchParams();
  const [data, setData] = useState<Row | null>(null),
    [options, setOptions] = useState<Row | null>(null),
    [unauth, setUnauth] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [modal, setModal] = useState<Row | null>(null),
    [mobile, setMobile] = useState(false),
    [busy, setBusy] = useState(false);
  const sequence = useRef(0),
    keys = useRef(new Map<string, string>());
  useEffect(() => {
    const recordId = /^\/data\/([0-9a-f-]{36})$/.exec(path)?.[1];
    if (
      !data ||
      !recordId ||
      !data.permissions.includes('read') ||
      data.records.some((r: Row) => r.id === recordId)
    )
      return;
    const abort = new AbortController();
    void fetch('/api/records/' + recordId, { signal: abort.signal })
      .then(async (res) => {
        const detail = await res.json();
        if (abort.signal.aborted) return;
        if (!res.ok) throw new Error(detail.error);
        setData((current) =>
          current && current.site === detail.site
            ? {
                ...current,
                records: [
                  ...current.records.filter((r: Row) => !detail.records.some((v: Row) => v.id === r.id)),
                  ...detail.records,
                ],
                events: [
                  ...current.events.filter((r: Row) => !detail.events.some((v: Row) => v.id === r.id)),
                  ...detail.events,
                ],
              }
            : current,
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [path, data?.site, data?.records]);
  useEffect(() => {
    if (!data?.permissions.includes('review')) return;
    const scan = async () => {
      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ action: 'alert.scan', site: data.site, input: {} }),
        });
        if (!res.ok) return;
        const result = await res.json();
        if (result.created || result.resolved)
          setToast(`ตรวจตามกำหนด: แจ้งใหม่ ${result.created} / เงื่อนไขคลี่คลาย ${result.resolved}`);
      } catch {
        /* Retry on next in-app cycle. */
      }
    };
    void scan();
    const timer = setInterval(scan, 60000);
    return () => clearInterval(timer);
  }, [data?.actor.id, data?.site]);
  const site = params.get('site') || '',
    from = params.get('from') || '',
    to = params.get('to') || '';
  const meetingDefault = path === '/analysis/monthly' && !from && !to;
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    const query = new URLSearchParams();
    if (site) query.set('site', site);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (meetingDefault) query.set('period', 'last-month');
    if (window.location.pathname === '/admin/audit') query.set('audit', '1');
    try {
      const res = await fetch('/api/bootstrap?' + query, { cache: 'no-store' });
      if (seq !== sequence.current) return;
      if (res.status === 401) {
        setUnauth(true);
        setData(null);
        setOptions(await (await fetch('/api/auth/options')).json());
        return;
      }
      const result = await res.json();
      if (seq !== sequence.current) return;
      if (!res.ok) throw new Error(result.error);
      setData(result);
      setUnauth(false);
      setError('');
    } catch (e) {
      if (seq === sequence.current) setError((e as Error).message);
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [site, from, to, meetingDefault]);
  useEffect(() => {
    setLoading(true);
    setData(null);
    void load();
  }, [load]);
  useEffect(() => {
    setMobile(false);
  }, [path]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const command: Command = async (action, input) => {
    const signature = JSON.stringify({ action, input, site: data?.site });
    let key = keys.current.get(signature);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(signature, key);
    }
    setBusy(true);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ action, site: data?.site, input }),
      });
      const result = await res.json();
      if (!res.ok) {
        keys.current.delete(signature);
        if (res.status === 401) setUnauth(true);
        throw new Error(result.error);
      }
      keys.current.delete(signature);
      setToast(
        'บันทึกสำเร็จ • ' +
          (result.number || result.status || result.id?.slice(0, 8) || 'ปรับปรุงข้อมูลแล้ว'),
      );
      await load();
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const safeCommand: Command = async (action, input) => {
    try {
      return await command(action, input);
    } catch {
      return {};
    }
  };
  async function login(uid: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      router.push(uid === 'admin' ? '/admin/master-data' : uid === 'owner' ? '/tasks' : '/overview');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (unauth || (path === '/login' && !data))
    return (
      <div className="login-page">
        <div className="login-brand">
          <div className="brand">
            <span className="logo-mark">
              <Leaf size={25} />
            </span>
            <span>
              envira<span className="brand-dot">.</span>
            </span>
          </div>
          <span className="eyebrow">ENVIRONMENTAL INTELLIGENCE</span>
          <h1>
            ข้อมูลที่เชื่อถือได้
            <br />
            สู่การลงมือทำที่ตรวจสอบได้
          </h1>
          <p>
            มองเห็นภาพรวมสิ่งแวดล้อม เชื่อมข้อมูลกับงานแก้ไข
            <br />
            และติดตามผลจนปิดประเด็นอย่างมั่นใจ
          </p>
          <div className="login-orbit">
            <Leaf size={72} />
            <span>Water</span>
            <span>Energy</span>
            <span>Waste</span>
            <span>Action</span>
          </div>
          <small>Environmental Intelligence & Action Management · P1</small>
        </div>
        <div className="login-form">
          <div className="login-card">
            <span className="eyebrow">ยินดีต้อนรับ</span>
            <h2>เข้าสู่พื้นที่ทำงาน</h2>
            <p>เฉพาะบัญชีที่องค์กรอนุญาตและกำหนดสิทธิ์แล้ว</p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {options?.google && (
              <a className="button google" href="/api/auth/google">
                เข้าสู่ระบบด้วย Google
              </a>
            )}
            {options?.local && (
              <>
                <div className="notice amber">
                  <strong>Demo • Local development เท่านั้น</strong>
                  <br />
                  บัญชีต่อไปนี้ใช้ทดสอบการแยกบทบาท ไม่มีรหัสผ่าน และไม่เปิดใช้บนระบบจริง
                </div>
                <Field label="เลือกบทบาท Demo">
                  <select id="demo-user" defaultValue="eo">
                    {options.users.map((u: Row) => (
                      <option value={u.id} key={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  disabled={busy}
                  className="button full"
                  onClick={() => login((document.getElementById('demo-user') as HTMLSelectElement).value)}
                >
                  เข้าสู่ระบบ Demo <ArrowUpRight size={17} />
                </button>
              </>
            )}
            {!options?.local && !options?.google && (
              <p className="notice">ยังไม่ได้ตั้งค่าบริการเข้าสู่ระบบ กรุณาติดต่อผู้ดูแล</p>
            )}
            <div className="login-foot">
              <ShieldCheck size={17} />
              สิทธิ์ถูกตรวจที่ระบบ backend ทุกครั้ง
            </div>
          </div>
        </div>
      </div>
    );
  if (loading || !data)
    return (
      <div className="loading">
        <span className="logo-mark">
          <Leaf size={30} />
        </span>
        <h2>{error ? 'ไม่สามารถโหลดพื้นที่ทำงาน' : 'กำลังโหลดข้อมูลสิ่งแวดล้อม…'}</h2>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button
              className="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              ลองใหม่
            </button>
          </>
        )}
      </div>
    );
  const has = (p: string) => data.permissions.includes(p);
  const q = `?site=${data.site}&from=${data.from}&to=${data.to}`;
  const current = path === '/' ? '/overview' : path;
  const title =
    names[current] ||
    (current.startsWith('/issues/')
      ? 'รายละเอียดประเด็น'
      : current.startsWith('/data/')
        ? 'ข้อมูลต้นทาง'
        : 'ไม่พบหน้า');
  const isMonitor = [
    '/monitoring/water',
    '/monitoring/wastewater',
    '/monitoring/energy',
    '/monitoring/waste',
  ].includes(current);
  const analytical =
    current === '/overview' || isMonitor || current === '/data/quality' || current === '/analysis/monthly';
  const routePermission =
    current.startsWith('/admin/users') || current.startsWith('/admin/sites')
      ? 'users'
      : current.startsWith('/admin/audit')
        ? 'audit'
        : current.startsWith('/admin')
          ? 'config'
          : current === '/data/imports'
            ? 'entry'
            : 'read';
  const source = (id: string) => {
    setModal({ type: 'source', id });
    if (!data.records?.some((r: Row) => r.id === id))
      void fetch('/api/records/' + encodeURIComponent(id))
        .then(async (res) => {
          const detail = await res.json();
          if (!res.ok) throw new Error(detail.error);
          setData((current) =>
            current && current.site === detail.site
              ? {
                  ...current,
                  records: [
                    ...current.records.filter((r: Row) => !detail.records.some((x: Row) => x.id === r.id)),
                    ...detail.records,
                  ],
                  events: [
                    ...current.events.filter((r: Row) => !detail.events.some((x: Row) => x.id === r.id)),
                    ...detail.events,
                  ],
                }
              : current,
          );
        })
        .catch((err) => setError(err.message));
  };
  const modalRecord = modal?.type === 'source' ? data.records?.find((r: Row) => r.id === modal.id) : null;
  const selectedIssue = current.startsWith('/issues/')
    ? data.issues?.find((i: Row) => i.id === current.split('/')[2])
    : null;
  let content: React.ReactNode;
  if (!has(routePermission))
    content = (
      <div className="panel">
        <Empty text="คุณไม่มีสิทธิ์เข้าถึงหน้านี้" />
        {has('config') && <Link href="/admin/master-data">เปิดหน้าจัดการระบบ</Link>}
      </div>
    );
  else if (current === '/overview' || isMonitor)
    content = (
      <Dashboard
        data={data}
        category={isMonitor ? current.split('/')[2].toUpperCase() : undefined}
        source={source}
      />
    );
  else if (current === '/analysis/monthly')
    content = (
      <MonthlyAnalysis
        data={data}
        source={source}
        openIssue={(initial) => setModal({ type: 'issue', initial })}
      />
    );
  else if (current === '/data/imports') content = <ImportPage data={data} command={command} />;
  else if (current === '/data' || current === '/data/production')
    content = (
      <RecordsTable
        data={data}
        rows={data.records}
        category={current === '/data/production' ? 'PRODUCTION' : undefined}
        source={source}
        command={safeCommand}
        onReject={(r) =>
          setModal({ type: 'reason', action: 'record.reject', record: r, title: 'ส่งข้อมูลกลับแก้ไข' })
        }
      />
    );
  else if (current === '/data/quality')
    content = (
      <div className="stack">
        <div className="summary-grid">
          <article>
            <strong>{data.records.filter((r: Row) => r.status === 'SUBMITTED').length}</strong>
            <span>ข้อมูลรอตรวจ</span>
          </article>
          <article>
            <strong>
              {data.analytics.kpis.reduce((n: number, k: Row) => n + k.coverage.missing.length, 0)}
            </strong>
            <span>ช่องข้อมูลที่ยังขาดในช่วงเลือก</span>
          </article>
          <article>
            <strong>{data.records.filter((r: Row) => r.status === 'REJECTED').length}</strong>
            <span>รายการส่งกลับแก้ไข</span>
          </article>
        </div>
        <RecordsTable
          data={data}
          rows={data.records}
          quality
          source={source}
          command={safeCommand}
          onReject={(r) =>
            setModal({ type: 'reason', action: 'record.reject', record: r, title: 'ส่งข้อมูลกลับแก้ไข' })
          }
        />
        <div className="panel">
          <h2>ตารางคาดหวังที่ยังไม่มีข้อมูล</h2>
          <p>ช่องที่ยังไม่ถึงกำหนดส่งยังไม่ถือเป็นการส่งล่าช้า · ข้อยกเว้นใช้เฉพาะรุ่นที่อนุมัติ</p>
          <Table headers={['วันที่', 'หมวด', 'จุดวัด', 'พารามิเตอร์', 'กำหนดส่ง']}>
            {data.analytics.kpis
              .flatMap((k: Row) => k.coverage.missing)
              .map((s: Row, i: number) => (
                <tr key={i}>
                  <td>{s.date}</td>
                  <td>{categoryNames[s.category]}</td>
                  <td>{s.asset}</td>
                  <td>{s.parameter}</td>
                  <td>{s.due}</td>
                </tr>
              ))}
          </Table>
        </div>
      </div>
    );
  else if (current.startsWith('/data/')) {
    const r = data.records.find((r: Row) => r.id === current.split('/')[2]);
    content = r ? (
      <SourceContent data={data} record={r} source={source} open={setModal} command={safeCommand} />
    ) : (
      <Empty text="ไม่พบข้อมูลในขอบเขตที่ได้รับอนุญาต" />
    );
  } else if (current === '/issues/new')
    content = (
      <div className="panel narrow">
        <IssueForm data={data} command={command} done={(r) => router.push('/issues/' + r.id)} />
      </div>
    );
  else if (selectedIssue)
    content = (
      <IssueDetail
        issue={selectedIssue}
        data={data}
        open={(m) => (m.type === 'source' ? source(m.id) : setModal(m))}
        command={safeCommand}
      />
    );
  else if (current === '/issues') content = <IssueList data={data} filter={params.get('status') || ''} />;
  else if (current === '/alerts')
    content = (
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>ตรวจพบจากกฎที่เปิดใช้</h2>
            <p>รับทราบ Alert ไม่เท่ากับปิด Issue • ค่ากลับปกติไม่ปิดงานอัตโนมัติ</p>
          </div>
          <div className="inline">
            <span className="count">{data.alerts.length}</span>
            {has('review') && (
              <button className="button secondary" onClick={() => safeCommand('alert.scan', {})}>
                ตรวจตามกำหนดตอนนี้
              </button>
            )}
          </div>
        </div>
        {!data.alerts.length ? (
          <Empty text="ยังไม่มี Alert จากเกณฑ์ที่เปิดใช้" />
        ) : (
          data.alerts.map((a: Row) => {
            const linked = data.issues.find((i: Row) => i.alert_id === a.id);
            return (
              <div className="alert-card" key={a.id}>
                <span className="alert-icon">
                  <AlertTriangle size={22} />
                </span>
                <div>
                  <div className="inline">
                    <Badge value={a.severity} />
                    <Badge value={a.status} />
                    {a.source_changed && <Badge value="ต้นทางมี revision / void" />}
                  </div>
                  <h3>{a.summary}</h3>
                  <small>
                    {new Date(a.created_at).toLocaleString('th-TH')} · {a.snapshot.rule.config.reference}
                  </small>
                  {a.record_id ? (
                    <button className="text-link" onClick={() => source(a.record_id)}>
                      ดูข้อมูลและเกณฑ์ต้นทาง
                    </button>
                  ) : (
                    <Link
                      className="text-link"
                      href={a.snapshot.issue_id ? '/issues/' + a.snapshot.issue_id : '/data/quality'}
                    >
                      เปิดรายการที่ต้องติดตาม
                    </Link>
                  )}
                </div>
                <div className="row-actions">
                  {a.status === 'NEW' && has('issue') && (
                    <button
                      className="button secondary"
                      onClick={() => safeCommand('alert.acknowledge', { id: a.id })}
                    >
                      รับทราบ
                    </button>
                  )}
                  {linked ? (
                    <Link className="button secondary" href={'/issues/' + linked.id}>
                      เปิด Issue
                    </Link>
                  ) : (
                    has('issue') && (
                      <button className="button" onClick={() => setModal({ type: 'issue', alert: a })}>
                        เปิดประเด็น
                      </button>
                    )
                  )}
                  {has('review') && !['DISMISSED', 'RESOLVED'].includes(a.status) && (
                    <button
                      className="text-link"
                      onClick={() =>
                        setModal({
                          type: 'reason',
                          action: 'alert.dismiss',
                          record: a,
                          title: 'ยกเลิกแจ้งเตือนพร้อมเหตุผล',
                        })
                      }
                    >
                      ยกเลิก Alert
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  else if (current === '/tasks') {
    const tasks = data.tasks.filter((t: Row) => t.owner_id === data.actor.id);
    const owned = data.issues.filter(
      (i: Row) => i.owner_id === data.actor.id && !['CLOSED', 'CANCELLED'].includes(i.status),
    );
    content = (
      <div className="stack">
        <div className="panel">
          <h2>Issue ที่ฉันรับผิดชอบ</h2>
          {owned.length ? (
            owned.map((i: Row) => (
              <Link className="list-button" key={i.id} href={'/issues/' + i.id}>
                <div>
                  <small>
                    {i.number} · กำหนด {shortDate(i.due_date)}
                  </small>
                  <strong>{i.title}</strong>
                </div>
                <Badge value={i.status} />
                <ArrowUpRight size={18} />
              </Link>
            ))
          ) : (
            <Empty text="ยังไม่มี Issue ที่มอบหมายให้คุณ" />
          )}
        </div>
        <div className="panel">
          <h2>Action ของฉัน</h2>
          {tasks.length ? (
            tasks.map((t: Row) => (
              <Link className="list-button" href={'/issues/' + t.issue_id} key={t.id}>
                <div>
                  <strong>{t.description}</strong>
                  <small>กำหนด {shortDate(t.due_date)}</small>
                </div>
                <Badge value={t.status} />
                <ArrowUpRight size={18} />
              </Link>
            ))
          ) : (
            <Empty text="ยังไม่มี Action ที่มอบหมาย" />
          )}
        </div>
      </div>
    );
  } else if (current === '/documents')
    content = (
      <div className="panel">
        <h2>คลังหลักฐานที่มีสิทธิ์เข้าถึง</h2>
        <p>เพิ่มหลักฐานจากหน้า Issue หรือข้อมูลต้นทางเพื่อรักษาการเชื่อมโยง</p>
        {data.evidence.length ? (
          <Table headers={['ชื่อไฟล์ / รุ่น', 'การตรวจ', 'ขนาด', 'เชื่อมโยง', 'ดาวน์โหลด']}>
            {data.evidence.map((e: Row) => (
              <tr key={e.id}>
                <td>
                  <strong>{e.filename}</strong>
                  <small>
                    v{e.version} · {shortDate(e.created_at)}
                  </small>
                </td>
                <td>{e.scan_status === 'DEV_VALIDATED' ? 'Local validation เท่านั้น' : e.scan_status}</td>
                <td>{fmt(e.size / 1024)} KB</td>
                <td>
                  {e.issue_id ? (
                    <Link href={'/issues/' + e.issue_id}>เปิด Issue</Link>
                  ) : (
                    <button className="text-link" onClick={() => source(e.record_id)}>
                      เปิดข้อมูล
                    </button>
                  )}
                </td>
                <td>
                  <a aria-label={'ดาวน์โหลด ' + e.filename} href={'/api/evidence/' + e.id}>
                    <Download size={18} />
                  </a>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="ยังไม่มีหลักฐานในพื้นที่นี้" />
        )}
      </div>
    );
  else if (current === '/reports')
    content = (
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>รายงานและ Snapshot</h2>
            <p>ตัวเลขผูกกับรุ่นข้อมูล ณ เวลาสร้างรายงาน · เผยแพร่ภายในระบบ</p>
          </div>
          {has('report') && (
            <button className="button" onClick={() => setModal({ type: 'reportCreate' })}>
              <Plus size={16} />
              สร้างรายงาน
            </button>
          )}
        </div>
        {data.reports.length ? (
          <Table headers={['รายงาน', 'ช่วงเวลา', 'สถานะ', 'แหล่งข้อมูล']}>
            {data.reports.map((r: Row) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.title}</strong>
                  <small>สร้าง {shortDate(r.created_at)}</small>
                </td>
                <td>
                  {shortDate(r.period_start)} – {shortDate(r.period_end)}
                </td>
                <td>
                  <Badge value={r.status} />
                </td>
                <td>
                  <button className="text-link" onClick={() => setModal({ type: 'report', id: r.id })}>
                    เปิด Snapshot
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="ยังไม่มีรายงาน สร้าง Snapshot จากข้อมูลที่อนุมัติได้" />
        )}
      </div>
    );
  else if (current === '/notifications')
    content = (
      <div className="panel">
        <h2>การแจ้งเตือนของฉัน</h2>
        {data.notifications.length ? (
          data.notifications.map((n: Row) => (
            <div className={'notification ' + (!n.read_at ? 'unread' : '')} key={n.id}>
              <Bell size={19} />
              <Link href={n.href}>
                <strong>{n.title}</strong>
                <small>{new Date(n.created_at).toLocaleString('th-TH')}</small>
              </Link>
              {!n.read_at && (
                <button className="text-link" onClick={() => safeCommand('notification.read', { id: n.id })}>
                  อ่านแล้ว
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty text="ไม่มีการแจ้งเตือน" />
        )}
      </div>
    );
  else if (current === '/admin/master-data' || current === '/admin/rules')
    content = (
      <AdminMasters key={current} data={data} command={command} rulesOnly={current.endsWith('/rules')} />
    );
  else if (current === '/admin/users') content = <AdminUsers data={data} command={command} />;
  else if (current === '/admin/sites') content = <AdminSites data={data} command={command} />;
  else if (current === '/admin/integrations')
    content = (
      <div className="integration-grid">
        {[
          [
            'Google sign-in',
            data.authMode === 'google' ? 'เปิดใช้ Google OIDC' : 'Local Demo adapter',
            'เข้าสู่ระบบแยกจากสิทธิ์จัดเก็บไฟล์',
          ],
          [
            'Evidence storage',
            data.storage === 'local' ? 'Local development เท่านั้น' : 'Storage gateway',
            'ตรวจสิทธิ์และ checksum ก่อนเปิดไฟล์',
          ],
          ['Database', 'PostgreSQL / PGlite local', 'ข้อมูลบันทึกถาวรผ่าน SQL migrations'],
          [
            'Google Sheets / Gmail / Chat',
            'ยังไม่เปิดใช้ · Phase 3',
            'P1 ใช้ CSV import และ in-app notifications',
          ],
          ['AI / Gemini', 'ยังไม่เปิดใช้ · Phase 2', 'P1 คำนวณและทำงานได้โดยไม่พึ่ง AI'],
        ].map(([title, status, note]) => (
          <article className="panel" key={title}>
            <span className="round-icon">
              <Plug size={22} />
            </span>
            <h2>{title}</h2>
            <p className="badge">{status}</p>
            <p>{note}</p>
          </article>
        ))}
      </div>
    );
  else if (current === '/admin/audit') content = <AuditPanel data={data} />;
  else
    content = <Empty text="ไม่พบหน้าหรือรายการในขอบเขตที่ได้รับอนุญาต" href="/overview" label="กลับภาพรวม" />;
  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <Link className="brand" href="/overview">
          <span className="logo-mark">
            <Leaf size={24} />
          </span>
          <span>
            envira<span className="brand-dot">.</span>
          </span>
          <button
            className="mobile-close icon-button"
            aria-label="ปิดเมนู"
            onClick={(e) => {
              e.preventDefault();
              setMobile(false);
            }}
          >
            <X size={20} />
          </button>
        </Link>
        <div className="brand-caption">ENVIRONMENTAL INTELLIGENCE</div>
        <nav>
          {nav.map((group) => (
            <div className="nav-group" key={group.group}>
              <span className="nav-heading">{group.group}</span>
              {group.items
                .filter(([, , , p]) => has(p))
                .map(([href, label, Icon]) => (
                  <Link
                    key={href}
                    className={'nav-link ' + (current === href ? 'active' : '')}
                    href={href + (href.startsWith('/monitoring') || href === '/overview' ? q : '')}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                    {href === '/data/quality' &&
                      data.records?.filter((r: Row) => r.status === 'SUBMITTED').length > 0 && (
                        <span className="nav-count">
                          {data.records.filter((r: Row) => r.status === 'SUBMITTED').length}
                        </span>
                      )}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="live-dot" />
          <div>
            <strong>Operational MVP</strong>
            <small>Phase 1 · พร้อมดำเนินงาน</small>
          </div>
        </div>
      </aside>
      {mobile && <button className="scrim" aria-label="ปิดเมนู" onClick={() => setMobile(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <div className="inline">
            <button className="icon-button menu-toggle" aria-label="เปิดเมนู" onClick={() => setMobile(true)}>
              <Menu size={22} />
            </button>
            <div className="breadcrumb">
              พื้นที่ทำงาน <span>/</span> <strong>{title}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className="system-status">
              <span className="live-dot" />
              ระบบพร้อมใช้งาน
            </span>
            <Link
              className="icon-button notification-button"
              href="/notifications"
              aria-label="เปิดการแจ้งเตือน"
            >
              <Bell size={20} />
              {data.notifications?.some((n: Row) => !n.read_at) && <i />}
            </Link>
            <div className="user-avatar">
              {data.actor.demo ? data.actor.name.match(/[A-H]/)?.[0] || 'D' : data.actor.name.charAt(0)}
            </div>
            <div className="user-label">
              <strong>{data.actor.name.split(' • ')[0]}</strong>
              <small>
                {data.actor.grants
                  .filter((g: Row) => g.site_id === data.site)
                  .map((g: Row) => g.role)
                  .join(' / ')}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="ออกจากระบบ / เปลี่ยนบัญชี Demo"
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                setData(null);
                setUnauth(true);
                setOptions(await (await fetch('/api/auth/options')).json());
                router.push('/login');
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                ENVIRONMENTAL OPERATIONS / {current === '/overview' ? 'OVERVIEW' : 'WORKSPACE'}
              </span>
              <h1>{title}</h1>
              <p>
                {current === '/overview'
                  ? 'ติดตามทรัพยากร เห็นสิ่งที่ต้องดูแล และเปลี่ยนข้อมูลให้เป็นการลงมือทำ'
                  : 'ข้อมูลและการดำเนินงานภายใต้ขอบเขตพื้นที่ที่คุณได้รับอนุญาต'}
              </p>
            </div>
            <div className="heading-actions">
              {current.startsWith('/data') && current !== '/data/imports' && has('entry') && (
                <button
                  className="button"
                  onClick={() =>
                    setModal({
                      type: 'record',
                      initial: current === '/data/production' ? { category: 'PRODUCTION' } : undefined,
                    })
                  }
                >
                  <Plus size={17} />
                  บันทึกข้อมูล
                </button>
              )}
              {current === '/issues' && has('issue') && (
                <button className="button" onClick={() => setModal({ type: 'issue' })}>
                  <Plus size={17} />
                  เปิดประเด็น
                </button>
              )}
              {analytical && has('export') && (
                <a className="button secondary" href={'/api/export' + q}>
                  <Download size={16} />
                  ส่งออก CSV
                </a>
              )}
            </div>
          </div>
          <form
            className="filterbar"
            key={`${data.site}-${data.from}-${data.to}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const query = new URLSearchParams({
                site: String(f.get('site')),
                from: String(f.get('from') || data.from),
                to: String(f.get('to') || data.to),
              });
              router.push(current + '?' + query);
            }}
          >
            <label>
              <Factory size={16} />
              <select aria-label="เลือก Site" name="site" defaultValue={data.site}>
                {data.sites.map((s: Row) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {analytical && (
              <>
                <label>
                  <span>ช่วงเวลา</span>
                  <input aria-label="วันที่เริ่มต้น" name="from" type="date" defaultValue={data.from} />
                  <span>–</span>
                  <input aria-label="วันที่สิ้นสุด" name="to" type="date" defaultValue={data.to} />
                </label>
                <span className="filter-context">เทียบช่วงก่อนหน้าเท่ากัน</span>
              </>
            )}
            {analytical && data.sites.find((s: Row) => s.id === data.site)?.demo && (
              <button
                className="button secondary demo-month-shortcut"
                type="button"
                onClick={() =>
                  router.push(
                    current +
                      '?' +
                      new URLSearchParams({ site: data.site, from: '2026-09-01', to: '2026-09-30' }),
                  )
                }
              >
                Demo กันยายน 2569
              </button>
            )}
            <button className="button filter-apply" type="submit">
              ใช้ตัวกรอง
            </button>
            <button className="icon-button" type="button" aria-label="รีเฟรชข้อมูล" onClick={() => load()}>
              <RefreshCw size={16} />
            </button>
          </form>
          {data.local && (
            <div className="demo-ribbon">
              <span>DEMO</span> สภาพแวดล้อม local development · ข้อมูลตัวอย่างมีป้าย Demo ·
              เกณฑ์กฎหมายยังไม่ยืนยัน
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button className="icon-button" aria-label="ปิดข้อความผิดพลาด" onClick={() => setError('')}>
                <X size={17} />
              </button>
            </div>
          )}
          {content}
          <footer className="page-footer">
            <span>ENVIRA · Environmental Intelligence & Action Management</span>
            <span>ข้อมูลแยกตาม Site · {data.analytics?.timezone || 'Asia/Bangkok'}</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
        </div>
      )}
      {busy && <div className="busy-line" role="status" aria-label="กำลังบันทึก" />}
      {modal && (
        <Modal
          title={
            modal.title ||
            (
              {
                record: 'บันทึกข้อมูลสิ่งแวดล้อม',
                source: 'ข้อมูลต้นทางและประวัติ',
                issue: 'เปิดประเด็นจากข้อมูล',
                evidence: 'แนบหลักฐาน',
                reportCreate: 'สร้างรายงาน Snapshot',
                report: 'รายงาน Snapshot',
              } as Row
            )[modal.type] ||
            'ดำเนินการ'
          }
          close={() => setModal(null)}
        >
          {modal.type === 'record' && (
            <RecordForm
              data={data}
              defaultCategory={modal.initial?.category}
              initial={modal.initial?.id ? modal.initial : undefined}
              command={command}
              done={() => setModal(null)}
            />
          )}
          {modal.type === 'source' &&
            (modalRecord ? (
              <SourceContent
                data={data}
                record={modalRecord}
                source={source}
                open={setModal}
                command={safeCommand}
              />
            ) : (
              <Empty text="ข้อมูลอยู่นอกชุดที่โหลดหรือไม่มีสิทธิ์" />
            ))}
          {modal.type === 'issue' && (
            <IssueForm
              data={data}
              alert={modal.alert}
              initial={modal.initial}
              command={command}
              done={(r) => {
                setModal(null);
                router.push('/issues/' + r.id);
              }}
            />
          )}
          {modal.type === 'issueAction' && (
            <ActionForm
              action={modal.action}
              issue={modal.issue}
              data={data}
              command={(action, input) => command(action, { ...input, task_id: modal.task_id })}
              done={() => setModal(null)}
            />
          )}
          {modal.type === 'evidence' && (
            <EvidenceForm
              issue={modal.issue}
              record={modal.record}
              command={command}
              done={() => setModal(null)}
            />
          )}
          {modal.type === 'reason' && (
            <ReasonForm
              command={command}
              action={modal.action}
              record={modal.record}
              done={() => setModal(null)}
            />
          )}
          {modal.type === 'reportCreate' && (
            <ReportForm data={data} command={command} done={() => setModal(null)} />
          )}
          {modal.type === 'report' && (
            <ReportDetail
              data={data}
              report={data.reports.find((r: Row) => r.id === modal.id)}
              source={source}
              command={safeCommand}
              open={setModal}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function SourceContent({
  record: r,
  data,
  source,
  open,
  command,
}: {
  record: Row;
  data: Row;
  source: (id: string) => void;
  open: (r: Row) => void;
  command: Command;
}) {
  const own = r.created_by === data.actor.id;
  const canReview = data.permissions.includes('review') && !own && r.submitted_by !== data.actor.id;
  const family = data.records.filter((x: Row) => x.family_id === r.family_id);
  return (
    <div className="stack">
      <div className="source-heading">
        <span className="eyebrow">
          {r.id} · VERSION {r.version}
        </span>
        <h2>
          {r.asset_code} / {r.parameter_code}
        </h2>
        <div className="kpi-value">
          {r.raw_value || fmt(r.value)} <span>{r.unit}</span>
        </div>
        <Badge value={r.status} />
        {r.demo && <span className="demo-tag">Demo</span>}
      </div>
      <div className="detail-grid">
        <div>
          <small>วันที่ / แหล่งที่มา</small>
          <strong>
            {iso(r.event_date)} / {r.source}
          </strong>
        </div>
        <div>
          <small>ผู้บันทึก</small>
          <strong>{data.users.find((u: Row) => u.id === r.created_by)?.name || r.created_by}</strong>
        </div>
        <div>
          <small>เลขอ้างอิง</small>
          <strong>{r.source_ref || '—'}</strong>
        </div>
        <div>
          <small>ขอบเขตการรวม</small>
          <strong>{r.config_snapshot.asset?.config.boundary}</strong>
        </div>
      </div>
      <p>{r.note}</p>
      {r.reason && <p className="notice amber">เหตุผล: {r.reason}</p>}
      <div className="action-bar">
        {data.permissions.includes('entry') &&
          ((r.status === 'DRAFT' && own) || ['APPROVED', 'REJECTED', 'VOIDED'].includes(r.status)) && (
            <button className="button secondary" onClick={() => open({ type: 'record', initial: r })}>
              {r.status === 'DRAFT' ? 'แก้ไขร่าง' : 'สร้าง revision'}
            </button>
          )}
        {r.status === 'DRAFT' && own && data.permissions.includes('entry') && (
          <>
            <button
              className="button"
              onClick={() => command('record.submit', { id: r.id, version: r.lock_version })}
            >
              ส่งตรวจข้อมูล
            </button>
            <button className="button secondary" onClick={() => open({ type: 'evidence', record: r })}>
              แนบหลักฐาน
            </button>
          </>
        )}
        {r.status === 'SUBMITTED' && canReview && (
          <>
            <button
              className="button"
              onClick={() => command('record.approve', { id: r.id, version: r.lock_version })}
            >
              อนุมัติข้อมูล
            </button>
            <button
              className="button secondary"
              onClick={() =>
                open({ type: 'reason', action: 'record.reject', record: r, title: 'ส่งกลับแก้ไข' })
              }
            >
              ส่งกลับแก้ไข
            </button>
          </>
        )}
        {r.status === 'APPROVED' && canReview && (
          <button
            className="text-link danger"
            onClick={() =>
              open({
                type: 'reason',
                action: 'record.void',
                record: r,
                title: 'ยกเลิกค่า approved โดยเก็บประวัติ',
              })
            }
          >
            Void พร้อมเหตุผล
          </button>
        )}
      </div>
      {own && data.permissions.includes('review') && (
        <p className="notice">คุณเป็นผู้สร้างรายการ จึงไม่สามารถอนุมัติรายการนี้เองได้</p>
      )}
      <details>
        <summary>ดูหน่วย เกณฑ์อ้างอิง และการตั้งค่าที่บันทึกพร้อมรายการ</summary>
        <JsonView value={r.config_snapshot} />
      </details>
      <h3>หลักฐานของข้อมูลรุ่นนี้</h3>
      {data.evidence
        .filter((e: Row) => e.record_id === r.id)
        .map((e: Row) => (
          <a href={'/api/evidence/' + e.id} key={e.id}>
            {e.filename} · v{e.version}
          </a>
        ))}
      <h3>รุ่นข้อมูลทั้งหมด</h3>
      {family.map((v: Row) => (
        <button className="list-button" key={v.id} onClick={() => source(v.id)}>
          <span>
            v{v.version} · {fmt(v.value)} {v.unit}
          </span>
          <Badge value={v.status} />
        </button>
      ))}
      <details>
        <summary>ประวัติการตรวจและการเปลี่ยนแปลง</summary>
        {data.events
          .filter((e: Row) => e.entity_id === r.id)
          .map((e: Row) => (
            <p key={e.id}>
              {new Date(e.created_at).toLocaleString('th-TH')} · {e.action} · {e.reason}
            </p>
          ))}
      </details>
    </div>
  );
}
function ReasonForm({
  command,
  action,
  record,
  done,
}: {
  command: Command;
  action: string;
  record: Row;
  done: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const reason = new FormData(e.currentTarget).get('reason');
        try {
          await command(action, { id: record.id, version: record.lock_version || record.version, reason });
          done();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <p>รายการ {record.id}</p>
      <Field label="เหตุผล (บังคับและเก็บในประวัติ)">
        <textarea name="reason" required rows={4} />
      </Field>
      {error && <p className="error">{error}</p>}
      <button className="button">ยืนยันพร้อมเหตุผล</button>
    </form>
  );
}
function IssueList({ data, filter }: { data: Row; filter: string }) {
  const [search, setSearch] = useState(''),
    [state, setState] = useState(filter),
    [page, setPage] = useState(0);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const active = (i: Row) => !['CLOSED', 'CANCELLED'].includes(i.status);
  const rows = data.issues.filter(
    (i: Row) =>
      (!search || `${i.title} ${i.number}`.toLowerCase().includes(search.toLowerCase())) &&
      (!state ||
        (state === 'MINE'
          ? i.owner_id === data.actor.id
          : state === 'OVERDUE'
            ? active(i) && i.due_date && iso(i.due_date) < today
            : state === 'UNASSIGNED'
              ? !i.owner_id && active(i)
              : state === 'CRITICAL'
                ? i.severity === 'CRITICAL' && active(i)
                : i.status === state)),
  );
  return (
    <div className="panel">
      <div className="table-toolbar">
        <input
          aria-label="ค้นหา Issue"
          placeholder="ค้นหาประเด็น หรือรหัส ENV…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="กรอง Issue"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(0);
          }}
        >
          <option value="">ทุกสถานะ</option>
          <option value="MINE">งานที่ฉันรับผิดชอบ</option>
          <option value="OVERDUE">เกินกำหนด</option>
          <option value="UNASSIGNED">ยังไม่มอบหมาย</option>
          <option value="CRITICAL">วิกฤต</option>
          {[
            'OPEN',
            'ASSIGNED',
            'INVESTIGATING',
            'ACTION_IN_PROGRESS',
            'WAITING_VERIFICATION',
            'VERIFIED',
            'CLOSED',
            'REOPENED',
            'CANCELLED',
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {rows.length ? (
        <Table headers={['ประเด็น', 'หมวด', 'ระดับ', 'สถานะ', 'ผู้รับผิดชอบ / กำหนด', '']}>
          {rows.slice(page * 25, page * 25 + 25).map((i: Row) => (
            <tr key={i.id}>
              <td>
                <small>{i.number}</small>
                <strong>{i.title}</strong>
              </td>
              <td>{categoryNames[i.category]}</td>
              <td>
                <Badge value={i.severity} />
              </td>
              <td>
                <Badge value={i.status} />
              </td>
              <td>
                {data.users.find((u: Row) => u.id === i.owner_id)?.name.split(' • ')[0] || 'ยังไม่มอบหมาย'}
                <small>{shortDate(i.due_date)}</small>
              </td>
              <td>
                <Link className="text-link" href={'/issues/' + i.id}>
                  เปิดงาน <ArrowUpRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty text="ไม่มีประเด็นตรงกับตัวกรอง" />
      )}
      <div className="pagination">
        <span>{rows.length} รายการ</span>
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          ก่อนหน้า
        </button>
        <button disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(page + 1)}>
          ถัดไป
        </button>
      </div>
    </div>
  );
}
function ReportForm({ data, command, done }: { data: Row; command: Command; done: () => void }) {
  const [error, setError] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await command('report.create', Object.fromEntries(new FormData(e.currentTarget)));
          done();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <Field label="ชื่อรายงาน">
        <input name="title" required defaultValue="รายงานสิ่งแวดล้อมประจำสัปดาห์" />
      </Field>
      <div className="form-grid">
        <Field label="เริ่มวันที่">
          <input name="from" type="date" required defaultValue={data.from} />
        </Field>
        <Field label="ถึงวันที่">
          <input name="to" type="date" required defaultValue={data.to} />
        </Field>
      </div>
      <p className="notice">
        ระบบจะเก็บตัวเลข coverage และรายการต้นทาง ณ เวลาสร้าง ไม่เปลี่ยนค่าตาม revision ภายหลัง
      </p>
      {error && <p className="error">{error}</p>}
      <button className="button">สร้าง Snapshot ฉบับร่าง</button>
    </form>
  );
}
function ReportDetail({
  data,
  report: r,
  source,
  command,
  open,
}: {
  data: Row;
  report: Row;
  source: (id: string) => void;
  command: Command;
  open: (r: Row) => void;
}) {
  if (!r) return <Empty />;
  const changed = r.snapshot.kpis
    .flatMap((k: Row) => k.sources)
    .some((id: string) =>
      data.records.some((v: Row) => v.id === id && ['SUPERSEDED', 'VOIDED'].includes(v.status)),
    );
  return (
    <div className="stack">
      <h2>{r.title}</h2>
      <Badge value={r.status} />
      <p>
        {shortDate(r.period_start)} – {shortDate(r.period_end)} · {r.snapshot.timezone}
      </p>
      {changed && (
        <p className="notice amber">
          ข้อมูลต้นทางมีการแก้ไขภายหลัง Snapshot นี้ยังคงค่าเดิม กรุณาสร้างรายงานใหม่เมื่อต้องการข้อมูลล่าสุด
        </p>
      )}
      <Table headers={['KPI', 'ค่า', 'หน่วย', 'อนุมัติ / คาดหวัง']}>
        {r.snapshot.kpis.map((k: Row) => (
          <tr key={k.code}>
            <td>{k.name}</td>
            <td>{fmt(k.value)}</td>
            <td>{k.unit}</td>
            <td>
              {k.coverage.approved}/{k.coverage.expected}
            </td>
          </tr>
        ))}
      </Table>
      <p>
        สร้าง {new Date(r.created_at).toLocaleString('th-TH')} · สูตร {r.snapshot.formulaVersion}
      </p>
      <details>
        <summary>แหล่งข้อมูลใน Snapshot</summary>
        {r.snapshot.kpis.map((k: Row) => (
          <div key={k.code}>
            <h3>{k.name}</h3>
            <div className="source-list">
              {k.sources.map((id: string) => (
                <button key={id} onClick={() => source(id)}>
                  {id.slice(0, 8)} <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </details>
      <div className="action-bar">
        {data.permissions.includes('export') && (
          <a className="button secondary" href={`/api/export?site=${data.site}&report=${r.id}`}>
            <Download size={15} />
            ดาวน์โหลด CSV
          </a>
        )}
        {data.permissions.includes('export') && (
          <a className="button secondary" href={`/api/export?site=${data.site}&report=${r.id}&format=xlsx`}>
            ดาวน์โหลด XLSX
          </a>
        )}
        {data.permissions.includes('export') && (
          <a className="button secondary" href={`/api/export?site=${data.site}&report=${r.id}&format=pdf`}>
            ดาวน์โหลด PDF
          </a>
        )}
        {['DRAFT', 'REJECTED'].includes(r.status) && r.created_by === data.actor.id && (
          <button
            className="button"
            onClick={() => command('report.submit', { id: r.id, version: r.version })}
          >
            ส่งรายงานตรวจ
          </button>
        )}
        {r.status === 'IN_REVIEW' &&
          r.created_by !== data.actor.id &&
          data.permissions.includes('review') && (
            <>
              <button
                className="button"
                onClick={() => command('report.approve', { id: r.id, version: r.version })}
              >
                อนุมัติรายงาน
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  open({ type: 'reason', action: 'report.reject', record: r, title: 'ส่งรายงานกลับแก้ไข' })
                }
              >
                ส่งกลับ
              </button>
            </>
          )}
        {r.status === 'APPROVED' && data.permissions.includes('review') && (
          <button
            className="button"
            onClick={() => command('report.publish', { id: r.id, version: r.version })}
          >
            เผยแพร่ภายใน
          </button>
        )}
      </div>
    </div>
  );
}
function AuditPanel({ data }: { data: Row }) {
  const [search, setSearch] = useState(''),
    [detail, setDetail] = useState<Row | null>(null);
  const rows = (data.audit || []).filter((e: Row) =>
    [e.actor_id, e.entity_id, e.action, e.reason].join(' ').toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="panel">
      <div className="panel-heading">
        <h2>ประวัติที่แก้ไขหรือลบไม่ได้</h2>
        <input
          aria-label="ค้นหา Audit"
          placeholder="ค้นหาผู้กระทำ / รายการ / เหตุการณ์"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Table headers={['เวลา', 'ผู้กระทำ', 'เหตุการณ์', 'รายการ', 'เหตุผล']}>
        {rows.map((e: Row) => (
          <tr key={e.id}>
            <td>{new Date(e.created_at).toLocaleString('th-TH')}</td>
            <td>{data.users.find((u: Row) => u.id === e.actor_id)?.name.split(' • ')[0] || e.actor_id}</td>
            <td>{e.action}</td>
            <td>
              <button className="text-link" onClick={() => setDetail(e)}>
                {e.entity_type} / {e.entity_id.slice(0, 8)}
              </button>
            </td>
            <td>{e.reason || '—'}</td>
          </tr>
        ))}
      </Table>
      {detail && (
        <Modal title="รายละเอียดการเปลี่ยนแปลง" close={() => setDetail(null)}>
          <JsonView value={detail} />
        </Modal>
      )}
    </div>
  );
}
