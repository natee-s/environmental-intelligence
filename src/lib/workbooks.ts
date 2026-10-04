import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { fail, type Row } from './core';

function checkArchive(bytes: Buffer) {
  if (bytes.length > 10 * 1024 * 1024 || bytes.readUInt32LE(0) !== 0x04034b50)
    fail('XLSX ต้องเป็นไฟล์ ZIP ที่ถูกต้องและไม่เกิน 10 MB');
  let total = 0,
    count = 0;
  for (let i = 0; i < bytes.length - 46; i++) {
    if (bytes.readUInt32LE(i) !== 0x02014b50) continue;
    const size = bytes.readUInt32LE(i + 24),
      nameLength = bytes.readUInt16LE(i + 28),
      extra = bytes.readUInt16LE(i + 30),
      comment = bytes.readUInt16LE(i + 32);
    const name = bytes.subarray(i + 46, i + 46 + nameLength).toString('utf8');
    total += size;
    count++;
    if (/vbaProject|externalLinks|connections\.xml/i.test(name))
      fail('ไม่รองรับ macro หรือการเชื่อมต่อข้อมูลภายนอกใน XLSX');
    if (total > 100 * 1024 * 1024 || count > 2000) fail('ข้อมูล XLSX หลังขยายใหญ่เกินขอบเขตที่รองรับ');
    i += 45 + nameLength + extra + comment;
  }
  if (!count) fail('โครงสร้าง XLSX ไม่ถูกต้อง');
}
export async function readWorkbook(base64: string, sheetName?: string) {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 46) fail('ไฟล์ XLSX ไม่สมบูรณ์');
  checkArchive(bytes);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheets = workbook.worksheets.map((s) => s.name);
  if (!sheetName) return { sheets };
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) fail('ไม่พบ Sheet ที่เลือก');
  if (sheet.rowCount > 50001 || sheet.columnCount > 50) fail('รองรับ 50,000 แถวข้อมูล และ 50 คอลัมน์ต่อชุด');
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = row.getCell(c);
      if (cell.type === ExcelJS.ValueType.Formula)
        fail(`เซลล์ ${cell.address} เป็นสูตร กรุณาแปลงเป็นค่าก่อนนำเข้า`);
      const value = cell.value;
      if (value instanceof Date) cells.push(value.toISOString().slice(0, 10));
      else if (value && typeof value === 'object') {
        if ('richText' in value) cells.push(value.richText.map((t) => t.text).join(''));
        else fail(`เซลล์ ${cell.address} มีชนิดข้อมูลที่ไม่รองรับ`);
      } else cells.push(String(value ?? ''));
    }
    rows.push(cells);
  });
  return { sheets, csv: Papa.unparse(rows) };
}
export async function writeWorkbook(rows: Row[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Environmental Intelligence';
  const sheet = wb.addWorksheet('Snapshot');
  const keys = rows.length ? Object.keys(rows[0]) : ['ไม่มีข้อมูล'];
  sheet.addRow(keys);
  for (const row of rows)
    sheet.addRow(
      keys.map((k) =>
        row[k] === null || row[k] === undefined
          ? ''
          : row[k] instanceof Date
            ? row[k].toISOString().slice(0, 10)
            : row[k],
      ),
    );
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF086A55' } };
  sheet.columns.forEach((c) => {
    c.width = 24;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
