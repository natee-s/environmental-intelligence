import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase, migrate } from '../src/lib/db';
import { seed } from '../src/lib/seed';
import { analytics } from '../src/lib/analytics';
import { execute, bootstrap } from '../src/lib/service';
import { actorById, id, one } from '../src/lib/core';
test('full September Demo is approved, reconciled, idempotent, and respects zero production and revisions', async () => {
  process.env.LOCAL_DEVELOPMENT = 'true';
  const db = await createDatabase(true);
  try {
    await migrate(db);
    await seed(db);
    const a = await analytics(db, 'site-a', '2026-09-01', '2026-09-30');
    assert.equal(a.kpis.length, 4);
    assert.ok(a.kpis.every((k) => k.coverage.status === 'COMPLETE'));
    assert.equal(a.production.coverage.status, 'COMPLETE');
    assert.equal(a.production.coverage.approved, 30);
    assert.ok(a.comparison.every((p) => p.matched === 30));
    assert.ok(a.ieatPlots.every((p) => p.samples.length === 30));
    assert.ok(a.ieatPlots.every((p) => p.samples.every((s: any) => s.status === 'NOT_EVALUATED')));
    assert.equal(a.wasteComposition.classifiedDays, 30);
    assert.equal(a.wasteComposition.total, a.kpis[3].value);
    assert.ok(a.wasteComposition.categories.slice(0, 3).every((c) => c.value !== null));
    assert.ok(
      Math.abs(
        a.wasteComposition.categories.slice(0, 3).reduce((s, c) => s + c.value!, 0) - a.kpis[3].value!,
      ) < 0.0000001,
    );
    const energy = a.comparison.find((p) => p.id === 'energy-production')!;
    const idle = energy.dailyIntensity.find((r) => r.date === '2026-09-13')!;
    assert.equal(idle.x, 0);
    assert.equal(idle.y, 860);
    assert.equal(idle.value, null);
    assert.equal(energy.idleDays.length, 1);
    assert.equal(energy.ratio, energy.totalY! / energy.totalX!);
    assert.ok(energy.periodTarget?.config.demo);
    assert.ok(energy.aboveTargetDays > 0);
    assert.equal(energy.targetEvaluatedDays, 29);
    const count = (await one(db, 'SELECT count(*)::int AS n FROM record_versions')).n;
    await seed(db);
    assert.equal((await one(db, 'SELECT count(*)::int AS n FROM record_versions')).n, count);
    const report = await execute(
      db,
      'eo',
      'report.create',
      'site-a',
      { title: 'Demo • September meeting', from: '2026-09-01', to: '2026-09-30' },
      id(),
    );
    const original = await one(
      db,
      "SELECT * FROM record_versions WHERE site_id='site-a' AND asset_code='W-MAIN' AND event_date='2026-09-09' AND status='APPROVED'",
    );
    let rev = await execute(
      db,
      'eo',
      'record.revise',
      'site-a',
      {
        id: original.id,
        version: original.lock_version,
        reason: 'Demo revision fixture',
        data: { value: Number(original.value) + 50 },
      },
      id(),
    );
    rev = await execute(db, 'eo', 'record.submit', 'site-a', { id: rev.id, version: rev.lock_version }, id());
    await execute(db, 'es1', 'record.approve', 'site-a', { id: rev.id, version: rev.lock_version }, id());
    const current = await analytics(db, 'site-a', '2026-09-01', '2026-09-30');
    assert.equal(current.kpis[0].value, a.kpis[0].value! + 50);
    assert.equal(
      (await one(db, 'SELECT snapshot FROM reports WHERE id=$1', [report.id])).snapshot.kpis[0].value,
      a.kpis[0].value,
    );
    await seed(db);
    assert.equal(
      (await analytics(db, 'site-a', '2026-09-01', '2026-09-30')).kpis[0].value,
      current.kpis[0].value,
    );
    const state = await bootstrap(
      db,
      await actorById(db, 'eo'),
      'site-a',
      undefined,
      undefined,
      'last-month',
    );
    assert.equal(state.from.slice(-2), '01');
    assert.ok(state.to < new Date().toISOString().slice(0, 10));
  } finally {
    await db.close();
  }
});
