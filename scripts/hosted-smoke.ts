import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const base = new URL(process.argv[2] || '').origin;
const code = (await readFile(process.argv[3], 'utf8')).trim();
if (!base.startsWith('https://')) throw new Error('Use the HTTPS URL of your own Demo deployment');
let cookie = '';
const checks: string[] = [];
async function get(path: string, status = 200) {
  const response = await fetch(base + path, {
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, status, `GET ${path}`);
  return response;
}
async function post(path: string, body: unknown, status: number, origin = base) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      'Idempotency-Key': crypto.randomUUID(),
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, status, `POST ${path}`);
  return response;
}
const health = await (await get('/api/health')).json();
assert.equal(health.database, 'postgres');
assert.equal(health.local, false);
checks.push('HTTPS health: PostgreSQL, local adapters disabled');
await get('/api/bootstrap', 401);
await post('/api/auth/demo', { code: 'invalid-code' }, 401);
await post('/api/auth/demo', { code }, 403, 'https://other.example.test');
await post('/api/auth/local', { userId: 'admin' }, 403);
await get('/api/auth/google', 403);
checks.push('Unauthenticated access, invalid code, foreign origin and alternative login rejected');
const login = await post('/api/auth/demo', { code }, 200);
const header = login.headers.get('set-cookie') || '';
assert.ok(/HttpOnly/i.test(header) && /Secure/i.test(header) && /SameSite=Lax/i.test(header));
cookie = header.split(';')[0];
const data = await (await get('/api/bootstrap?site=site-a&from=2026-09-01&to=2026-09-30')).json();
assert.equal(data.actor.id, 'demo-viewer');
assert.deepEqual(data.permissions.sort(), ['export', 'read']);
assert.equal(data.sites.length, 1);
assert.equal(data.sites[0].demo, true);
assert.ok(data.analytics.kpis.length >= 4);
assert.ok(data.analytics.kpis.every((k: { daily: unknown[] }) => k.daily.length === 30));
assert.equal(data.analytics.ieatPlots.length, 8);
checks.push('Demo login: Secure cookie, single Demo Site, 30-day KPI series, eight wastewater parameters');
for (const action of ['record.save', 'master.save', 'issue.assign', 'notification.read'])
  await post('/api/command', { action, site: 'site-a', input: {} }, 403);
await get('/api/bootstrap?site=site-b', 403);
await get('/api/records?site=site-b', 403);
await get('/api/export?site=site-b&from=2026-09-01&to=2026-09-30', 403);
checks.push('Business mutations and cross-Site read/export rejected');
const source = data.analytics.kpis.flatMap((k: { sources: string[] }) => k.sources)[0];
assert.ok(source);
await get('/api/records/' + source);
const csv = await get('/api/export?site=site-a&from=2026-09-01&to=2026-09-30');
assert.ok(csv.headers.get('content-type')?.includes('text/csv'));
assert.ok((await csv.text()).includes('2026-09-30'));
checks.push('Source link and September CSV export available');
await post('/api/auth/logout', {}, 200);
await get('/api/bootstrap', 401);
checks.push('Logout revokes session');
const result = { url: base, checkedAt: new Date().toISOString(), checks };
await writeFile('.local/render-smoke.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
