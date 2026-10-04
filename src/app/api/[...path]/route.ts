import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { database } from '@/lib/db';
import {
  authenticate,
  session,
  cookieName,
  localOnly,
  sameOrigin,
  token,
  authEvent,
  rateLimit,
  hostedDemoConfig,
  loginHostedDemo,
} from '@/lib/auth';
import { bootstrap, execute } from '@/lib/service';
import { DomainError, authorize, one, hash, fail, event, type Row, type Actor } from '@/lib/core';
import { getEvidence } from '@/lib/storage';
import { writeWorkbook } from '@/lib/workbooks';
import { reportPdf } from '@/lib/pdf-report';
import { listRecords } from '@/lib/lists';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const secure = () => new URL(process.env.APP_URL || 'http://localhost:3000').protocol === 'https:';
const cookieOptions = () => ({
  httpOnly: true,
  secure: secure(),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 8 * 3600,
});
async function handler(req: NextRequest) {
  const db = await database();
  const route = req.nextUrl.pathname.replace('/api/', '');
  let auditActor: Actor | undefined;
  try {
    if (route === 'health')
      return json({
        ok: !!(await db.query('SELECT 1')).rows.length,
        database: process.env.DB_DRIVER || 'pglite',
        local: process.env.LOCAL_DEVELOPMENT === 'true',
      });
    if (route === 'auth/options') {
      const local = process.env.LOCAL_DEVELOPMENT === 'true' && process.env.AUTH_MODE === 'local';
      const hostedDemo = process.env.AUTH_MODE === 'hosted-demo';
      if (hostedDemo) hostedDemoConfig();
      return json({
        local,
        hostedDemo,
        google: !hostedDemo && !!process.env.GOOGLE_CLIENT_ID,
        users: local
          ? (await db.query('SELECT id,name,email FROM users WHERE active=true AND demo=true ORDER BY name'))
              .rows
          : [],
      });
    }
    if (route === 'auth/demo' && req.method === 'POST') {
      sameOrigin(req);
      if (Number(req.headers.get('content-length') || 0) > 1024) fail('ข้อมูลใหญ่เกินกำหนด', 413);
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 1024) fail('ข้อมูลใหญ่เกินกำหนด', 413);
      const value = await loginHostedDemo(db, JSON.parse(raw).code);
      await authEvent(db, 'demo-viewer', 'LOGIN_HOSTED_DEMO');
      const res = json({ ok: true });
      res.cookies.set(cookieName, value, cookieOptions());
      return res;
    }
    if (route === 'auth/local' && req.method === 'POST') {
      sameOrigin(req);
      localOnly(req);
      rateLimit('local-login');
      const body = await req.json();
      const u = await one(db, 'SELECT id FROM users WHERE id=$1 AND active=true AND demo=true', [
        body.userId,
      ]);
      const value = await session(db, u.id);
      await authEvent(db, u.id, 'LOGIN_LOCAL_DEMO');
      const res = json({ ok: true });
      res.cookies.set(cookieName, value, cookieOptions());
      return res;
    }
    if (route === 'auth/google') {
      if (process.env.AUTH_MODE === 'hosted-demo') fail('Demo ออนไลน์ใช้รหัสเข้าชม', 403);
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
        fail('ยังไม่ได้ตั้งค่า Google sign-in', 503);
      rateLimit('google-login');
      const state = token(),
        nonce = token(),
        verifier = token();
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }).toString();
      const res = NextResponse.redirect(url);
      for (const [key, value] of Object.entries({ state, nonce, verifier }))
        res.cookies.set('oauth_' + key, value, { ...cookieOptions(), maxAge: 600 });
      return res;
    }
    if (route === 'auth/google/callback') {
      if (process.env.AUTH_MODE === 'hosted-demo') fail('Demo ออนไลน์ใช้รหัสเข้าชม', 403);
      const state = req.nextUrl.searchParams.get('state');
      if (!state || state !== req.cookies.get('oauth_state')?.value || !req.nextUrl.searchParams.get('code'))
        fail('Google sign-in ถูกยกเลิกหรือ state ไม่ถูกต้อง', 401);
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: req.nextUrl.searchParams.get('code')!,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
          grant_type: 'authorization_code',
          code_verifier: req.cookies.get('oauth_verifier')?.value || '',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) fail('Google sign-in ไม่สำเร็จ กรุณาลองใหม่', 401);
      const data = await response.json();
      const { payload } = await jwtVerify(
        data.id_token,
        createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
        {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: process.env.GOOGLE_CLIENT_ID,
        },
      );
      if (payload.nonce !== req.cookies.get('oauth_nonce')?.value || payload.email_verified !== true)
        fail('ไม่สามารถยืนยันบัญชี Google', 401);
      const u = await one(db, 'SELECT id FROM users WHERE lower(email)=$1 AND active=true AND demo=false', [
        String(payload.email).toLowerCase(),
      ]);
      const membership = await db.query('SELECT 1 FROM grants WHERE user_id=$1', [u.id]);
      if (!membership.rows.length) fail('บัญชีนี้ยังไม่ได้รับสิทธิ์', 403);
      const res = NextResponse.redirect(new URL('/overview', process.env.APP_URL));
      res.cookies.set(cookieName, await session(db, u.id), cookieOptions());
      for (const key of ['state', 'nonce', 'verifier']) res.cookies.delete('oauth_' + key);
      await authEvent(db, u.id, 'LOGIN_GOOGLE');
      return res;
    }
    const actor = await authenticate(db, req);
    auditActor = actor;
    if (route === 'auth/logout' && req.method === 'POST') {
      sameOrigin(req);
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [
        hash(req.cookies.get(cookieName)?.value || ''),
      ]);
      await authEvent(db, actor.id, 'LOGOUT');
      const res = json({ ok: true });
      res.cookies.delete(cookieName);
      return res;
    }
    if (route === 'bootstrap' && req.method === 'GET') {
      const result = await bootstrap(
        db,
        actor,
        req.nextUrl.searchParams.get('site') || undefined,
        req.nextUrl.searchParams.get('from') || undefined,
        req.nextUrl.searchParams.get('to') || undefined,
        req.nextUrl.searchParams.get('period') || undefined,
      );
      if (req.nextUrl.searchParams.get('audit') === '1') {
        authorize(actor, result.site, 'audit');
        await event(db, actor, result.site, 'auth', actor.id, 'AUDIT_READ');
      }
      return json(result);
    }
    if (route === 'records' && req.method === 'GET')
      return json(
        await listRecords(
          db,
          actor,
          req.nextUrl.searchParams.get('site') || '',
          Object.fromEntries(req.nextUrl.searchParams),
        ),
      );
    if (route === 'jobs' && req.method === 'GET') {
      const site = req.nextUrl.searchParams.get('site') || '';
      authorize(actor, site, 'entry');
      return json({
        jobs: (
          await db.query(
            'SELECT id,batch_id,kind,status,cursor,total,error,updated_at FROM background_jobs WHERE site_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 30',
            [site, actor.id],
          )
        ).rows,
      });
    }
    if (route.startsWith('imports/') && req.method === 'GET') {
      const site = req.nextUrl.searchParams.get('site') || '';
      authorize(actor, site, 'entry');
      const batch = await one(db, 'SELECT * FROM import_batches WHERE id=$1 AND site_id=$2', [
        route.split('/')[1],
        site,
      ]);
      const rows: Row[] = batch.rows;
      if (req.nextUrl.searchParams.get('errors') === '1') {
        const escape = (s: unknown) => '"' + String(s ?? '').replaceAll('"', '""') + '"';
        const csv =
          '\uFEFFrow,error\r\n' +
          rows
            .filter((r) => r.error)
            .map((r) => [r.row, r.error].map(escape).join(','))
            .join('\r\n');
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="import-errors.csv"',
            'Cache-Control': 'private, no-store',
          },
        });
      }
      return json({
        ...batch,
        rows: rows.slice(0, 200),
        total: rows.length,
        valid: rows.filter((r) => !r.error).length,
        result: batch.result
          ? { imported: batch.result.imported.length, skipped: batch.result.skipped.length }
          : null,
      });
    }
    if (route.startsWith('records/') && req.method === 'GET') {
      const recordId = route.split('/')[1];
      const found = (
        await db.query<Row>(
          'SELECT r.* FROM record_versions r JOIN grants g ON g.site_id=r.site_id WHERE r.id=$1 AND g.user_id=$2 LIMIT 1',
          [recordId, actor.id],
        )
      ).rows[0];
      if (!found) fail('ไม่พบรายการหรือไม่มีสิทธิ์', 404);
      authorize(actor, found.site_id, 'read');
      const records = (
        await db.query('SELECT * FROM record_versions WHERE family_id=$1 AND site_id=$2', [
          found.family_id,
          found.site_id,
        ])
      ).rows;
      const events = (
        await db.query(
          'SELECT * FROM events WHERE site_id=$1 AND entity_id IN(SELECT id FROM record_versions WHERE family_id=$2)',
          [found.site_id, found.family_id],
        )
      ).rows;
      return json({ site: found.site_id, records, events });
    }
    if (route === 'command' && req.method === 'POST') {
      if (process.env.AUTH_MODE === 'hosted-demo') fail('Demo ออนไลน์เปิดให้อ่านอย่างเดียว', 403);
      sameOrigin(req);
      if (!req.headers.get('content-type')?.includes('application/json')) fail('ต้องส่ง JSON', 415);
      if (Number(req.headers.get('content-length') || 0) > 32 * 1024 * 1024) fail('ข้อมูลใหญ่เกินกำหนด', 413);
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 32 * 1024 * 1024) fail('ข้อมูลใหญ่เกินกำหนด', 413);
      const body = JSON.parse(raw);
      return json(
        await execute(
          db,
          actor.id,
          body.action,
          body.site,
          body.input || {},
          req.headers.get('idempotency-key') || '',
        ),
      );
    }
    if (route.startsWith('evidence/') && req.method === 'GET') {
      const evidenceId = route.split('/')[1];
      const rows = (
        await db.query<Row>(
          'SELECT e.* FROM evidence e JOIN grants g ON g.site_id=e.site_id WHERE e.id=$1 AND g.user_id=$2 LIMIT 1',
          [evidenceId, actor.id],
        )
      ).rows;
      const row = rows[0] || fail('ไม่พบรายการหรือไม่มีสิทธิ์', 404);
      authorize(actor, row.site_id, 'read');
      const file = await getEvidence(row as Parameters<typeof getEvidence>[0]);
      await event(db, actor, row.site_id, 'evidence', row.id, 'DOWNLOAD');
      return new NextResponse(new Uint8Array(file), {
        headers: {
          'Content-Type': row.mime,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (route === 'export' && req.method === 'GET') {
      const site = req.nextUrl.searchParams.get('site') || '';
      authorize(actor, site, 'export');
      const reportId = req.nextUrl.searchParams.get('report');
      let rows: Row[];
      if (reportId) {
        const report = await one(db, 'SELECT * FROM reports WHERE id=$1 AND site_id=$2', [reportId, site]);
        if (req.nextUrl.searchParams.get('format') === 'pdf') {
          const bytes = await reportPdf(report, await one(db, 'SELECT * FROM sites WHERE id=$1', [site]));
          await event(db, actor, site, 'export', report.id, 'EXPORT', null, {
            format: 'pdf',
            snapshot_hash: report.snapshot.hash,
          });
          return new NextResponse(new Uint8Array(bytes), {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': 'attachment; filename="environment-report.pdf"',
              'Cache-Control': 'private, no-store',
            },
          });
        }
        rows = report.snapshot.kpis.map((k: Row) => ({
          code: k.code,
          period_start: report.period_start,
          period_end: report.period_end,
          value: k.value,
          unit: k.unit,
          coverage: k.coverage.approvedPercent,
          source_ids: k.sources.join(' '),
          snapshot_hash: report.snapshot.hash,
        }));
      } else {
        if (req.nextUrl.searchParams.get('format') === 'pdf') fail('PDF ต้องเลือก report snapshot');
        const from = req.nextUrl.searchParams.get('from'),
          to = req.nextUrl.searchParams.get('to');
        if (!from || !to) fail('ต้องเลือกช่วงเวลา');
        rows = (
          await db.query<Row>(
            "SELECT id,event_date,category,asset_code,parameter_code,value,unit,kind,status,source,source_ref,demo FROM record_versions WHERE site_id=$1 AND event_date BETWEEN $2::date AND $3::date AND status='APPROVED' ORDER BY event_date",
            [site, from, to],
          )
        ).rows;
      }
      await event(db, actor, site, 'export', reportId || site, 'EXPORT', null, {
        rows: rows.length,
        format: req.nextUrl.searchParams.get('format') || 'csv',
      });
      if (req.nextUrl.searchParams.get('format') === 'xlsx') {
        const bytes = await writeWorkbook(rows);
        return new NextResponse(new Uint8Array(bytes), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="environment-report.xlsx"',
            'Cache-Control': 'no-store',
          },
        });
      }
      const escape = (x: unknown) => {
        let s = x === null ? '' : String(x);
        if (typeof x === 'string' && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
      };
      const keys = rows.length ? Object.keys(rows[0]) : ['ไม่มีข้อมูล'];
      const csv =
        '\uFEFF' + [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\r\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="environment-report.csv"',
          'Cache-Control': 'no-store',
        },
      });
    }
    fail('ไม่พบ endpoint', 404);
  } catch (e) {
    if (e instanceof DomainError && [401, 403].includes(e.status))
      try {
        await authEvent(db, auditActor?.id || null, 'ACCESS_DENIED');
      } catch {
        /* Do not expose audit persistence internals in an authorization response. */
      }
    if (e instanceof DomainError) return json({ error: e.message }, e.status);
    if (e instanceof SyntaxError) return json({ error: 'JSON ไม่ถูกต้อง' }, 400);
    const code = (e as { code?: string }).code;
    if (code === '23505')
      return json({ error: 'มีรายการหรือรุ่นนี้แล้ว กรุณารีเฟรชตรวจสอบ (conflict)' }, 409);
    console.error('API error', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'ระบบไม่สามารถดำเนินการได้ กรุณาลองใหม่หรือตรวจ log' }, 500);
  }
}
export const GET = handler;
export const POST = handler;
