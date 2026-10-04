import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wasteComposition } from '../src/lib/waste-analytics';
const entry = (
  id: string,
  value: number,
  boundary: string,
  type?: string,
  parent?: string,
  kind = 'GENERATED',
) => ({
  value,
  sources: [id],
  record: {
    id,
    category: 'WASTE',
    kind,
    event_date: '2026-09-01',
    asset_code: id,
    config_snapshot: {
      asset: { config: { boundary, parent } },
      wasteType: type
        ? {
            config: { classification: type, hazardous: type === 'HAZARDOUS', recyclable: type === 'RECYCLE' },
          }
        : null,
    },
  },
});
test('waste taxonomy reconciles children without double counting parent or handled transactions', () => {
  const result = wasteComposition(
    [
      entry('total', 100, 'INCLUDED'),
      entry('recycle', 50, 'BREAKDOWN', 'RECYCLE', 'total'),
      entry('haz', 20, 'BREAKDOWN', 'HAZARDOUS', 'total'),
      entry('general', 30, 'BREAKDOWN', 'GENERAL', 'total'),
      entry('shipment', 500, 'INCLUDED', 'RECYCLE', undefined, 'RECYCLED'),
    ],
    ['2026-09-01', '2026-09-02'],
  );
  assert.equal(result.total, 100);
  assert.deepEqual(
    result.categories.map((c) => c.value),
    [50, 20, 30, null],
  );
  assert.equal(result.daily[1].total, null);
  assert.equal(result.daily[1].RECYCLE, null);
  assert.equal(result.classifiedDays, 1);
});
test('unknown and contradictory breakdown remain visible; hazardous recyclable waste is classified only once', () => {
  const over = wasteComposition(
    [entry('total', 100, 'INCLUDED'), entry('child', 120, 'BREAKDOWN', 'RECYCLE', 'total')],
    ['2026-09-01'],
  );
  assert.equal(over.total, 100);
  assert.equal(over.categories[3].value, 100);
  assert.equal(over.categories[0].value, null);
  assert.equal(over.warnings.length, 1);
  const hazardous = entry('haz', 12, 'INCLUDED', 'HAZARDOUS');
  hazardous.record.config_snapshot.wasteType!.config.recyclable = true;
  const r = wasteComposition([hazardous, entry('untyped', 30, 'INCLUDED')], ['2026-09-01']);
  assert.equal(r.categories[0].value, null);
  assert.equal(r.categories[1].value, 12);
  assert.equal(r.categories[3].value, 30);
  assert.equal(r.total, 42);
});
