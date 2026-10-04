import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, migrate, type DB } from '../src/lib/db';
import { seed } from '../src/lib/seed';
import {
  authenticate,
  cookieName,
  loginHostedDemo,
  provisionDemoViewer,
  session,
  sameOrigin,
} from '../src/lib/auth';
import { can, demoViewerId, hash, id } from '../src/lib/core';
import { bootstrap, execute } from '../src/lib/service';
let db: DB;
const code = 'test-only-viewer-code-123456789';
const request = (token: string) =>
  new Request('https://demo.example.test/api/bootstrap', {
    headers: { cookie: `${cookieName}=${token}`, host: 'demo.example.test' },
  });
before(async () => {
  process.env.AUTH_MODE = 'hosted-demo';
  process.env.LOCAL_DEVELOPMENT = 'false';
  process.env.DB_DRIVER = 'postgres';
  process.env.APP_URL = 'https://demo.example.test';
  process.env.DEMO_ACCESS_CODE = code;
  db = await createDatabase(true);
  await migrate(db);
  await seed(db, { monthly: false });
  await provisionDemoViewer(db);
});
after(async () => {
  await db.close();
});
test('hosted Demo requires a strong configured code and a matching origin', async () => {
  await assert.rejects(() => loginHostedDemo(db, 'wrong'), { status: 401 });
  await assert.rejects(() => loginHostedDemo(db, null), { status: 401 });
  process.env.DEMO_ACCESS_CODE = 'short';
  await assert.rejects(() => loginHostedDemo(db, 'short'), { status: 503 });
  process.env.DEMO_ACCESS_CODE = code;
  assert.throws(
    () =>
      sameOrigin(
        new Request('https://demo.example.test/api/auth/demo', {
          headers: { host: 'demo.example.test', origin: 'https://other.example.test' },
        }),
      ),
    { status: 403 },
  );
});
test('viewer reads approved KPI and exports, cannot mutate or gain Site/role access from altered grants', async () => {
  await db.query("INSERT INTO grants(user_id,site_id,role) VALUES($1,'site-a','ES'),($1,'site-b','MG')", [
    demoViewerId,
  ]);
  const value = await loginHostedDemo(db, code);
  const actor = await authenticate(db, request(value));
  assert.equal(can(actor, 'site-a', 'read'), true);
  assert.equal(can(actor, 'site-a', 'export'), true);
  assert.equal(can(actor, 'site-a', 'review'), false);
  assert.equal(can(actor, 'site-b', 'read'), false);
  const data = await bootstrap(db, actor, 'site-a');
  assert.deepEqual(
    data.sites.map((s: { id: string }) => s.id),
    ['site-a'],
  );
  assert.ok(data.analytics.kpis.length);
  await assert.rejects(() => bootstrap(db, actor, 'site-b'), { status: 403 });
  for (const action of ['record.save', 'issue.assign', 'notification.read', 'master.save'])
    await assert.rejects(() => execute(db, actor.id, action, 'site-a', {}, id()), { status: 403 });
  const saved = (
    await db.query<{ demo_access_hash: string }>(
      'SELECT demo_access_hash FROM sessions WHERE token_hash=$1',
      [hash(value)],
    )
  ).rows[0];
  assert.equal(saved.demo_access_hash, hash(code));
  assert.notEqual(saved.demo_access_hash, code);
});
test('code rotation and suspended viewer invalidate sessions; other user sessions cannot enter hosted Demo', async () => {
  const value = await loginHostedDemo(db, code);
  process.env.DEMO_ACCESS_CODE = 'another-test-code-123456789';
  await assert.rejects(() => authenticate(db, request(value)), { status: 401 });
  process.env.DEMO_ACCESS_CODE = code;
  const otherSession = await session(db, 'admin', hash(code));
  await assert.rejects(() => authenticate(db, request(otherSession)), { status: 401 });
  await db.query('UPDATE users SET active=false WHERE id=$1', [demoViewerId]);
  await assert.rejects(() => authenticate(db, request(value)), { status: 401 });
  await db.query('UPDATE users SET active=true WHERE id=$1', [demoViewerId]);
  await db.query("UPDATE sites SET demo=false WHERE id='site-b'");
  await assert.rejects(() => provisionDemoViewer(db), { status: 503 });
});
