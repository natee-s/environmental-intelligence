import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readWorkbook, writeWorkbook } from '../src/lib/workbooks';
test('XLSX roundtrip preserves text and values; formula-like strings remain strings', async () => {
  const rows = [{ category: 'WATER', date: '2026-10-03', value: 123.4, note: '=HYPERLINK("bad")' }];
  const bytes = await writeWorkbook(rows);
  const result = await readWorkbook(bytes.toString('base64'), 'Snapshot');
  assert.ok(result.csv?.includes('123.4'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
  assert.equal(wb.worksheets[0].getCell('D2').type, ExcelJS.ValueType.String);
  assert.deepEqual((await readWorkbook(bytes.toString('base64'))).sheets, ['Snapshot']);
});
test('XLSX formulas are not imported as cached trustworthy facts', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['value']);
  ws.getCell('A2').value = { formula: '1+2', result: 3 };
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  await assert.rejects(() => readWorkbook(bytes.toString('base64'), 'Sheet1'), /สูตร/);
});
test('invalid workbook fails before parsing', async () => {
  await assert.rejects(() => readWorkbook(Buffer.from('bad').toString('base64')), /ไม่สมบูรณ์/);
});
