import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairStatistics, comparisonData } from '../src/lib/comparison';

test('paired statistics exclude missing/partial days, retain genuine zero and use ratio of sums', () => {
  const stats = pairStatistics([
    { x: 0, y: 0, complete: true },
    { x: 10, y: 20, complete: true },
    { x: 20, y: 40, complete: true },
    { x: null, y: 999, complete: true },
    { x: 50, y: 999, complete: false },
  ]);
  assert.deepEqual(stats, { matched: 3, excluded: 2, correlation: 1, totalX: 30, totalY: 60, ratio: 2 });
  assert.equal(pairStatistics([{ x: 1, y: 2, complete: true }]).correlation, null);
  assert.equal(
    pairStatistics(Array.from({ length: 3 }, () => ({ x: 1, y: 2, complete: true }))).correlation,
    null,
  );
  assert.equal(pairStatistics([{ x: 0, y: 1, complete: true }]).ratio, null);
  assert.equal(pairStatistics([{ x: null, y: null, complete: false }]).totalX, null);
});
test('comparison preserves partial observations, requires schedules and does not join mixed production units', () => {
  const date = '2026-01-01';
  const a = {
    production: { unit: null, coverage: { slots: [{ date, approved: true }] } },
    kpis: ['WATER', 'WASTEWATER', 'ENERGY', 'WASTE'].map((category) => ({
      category,
      unit: category === 'ENERGY' ? 'kWh' : 'm³',
      daily: [{ date, value: 42, complete: true, sources: ['resource'] }],
    })),
  };
  const production = [
    {
      id: 'one',
      event_date: date,
      value: 10,
      config_snapshot: { unit: { config: { base: 't', factor: 1 } } },
    },
    {
      id: 'two',
      event_date: date,
      value: 100,
      config_snapshot: { unit: { config: { base: 'piece', factor: 1 } } },
    },
  ];
  const pairs = comparisonData(a, production, date, date);
  assert.equal(pairs[0].matched, 1);
  assert.equal(pairs[1].rows[0].x, null);
  assert.equal(pairs[1].matched, 0);
  a.production.unit = 't' as any;
  a.production.coverage.slots = [];
  const p = comparisonData(a, [production[0]], date, date)[1];
  assert.equal(p.rows[0].x, 10);
  assert.equal(p.rows[0].complete, false);
  assert.equal(p.matched, 0);
});
