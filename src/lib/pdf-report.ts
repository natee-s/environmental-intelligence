import PDFDocument from 'pdfkit';
import path from 'node:path';
import type { Row } from './core';
import { dateString } from './core';

/** All values and lineage come from the immutable report snapshot. */
export async function reportPdf(report: Row, site: Row): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 42,
    bufferPages: true,
    info: { Title: report.title, Author: 'Environmental Intelligence' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const root = path.resolve('node_modules/@fontsource/noto-sans-thai/files');
  doc.registerFont('Thai', path.join(root, 'noto-sans-thai-thai-400-normal.woff'));
  doc.registerFont('Latin', path.join(root, 'noto-sans-thai-latin-400-normal.woff'));
  const text = (value: unknown, size = 10, color = '#243b33') => {
    const s = String(value ?? 'N/A')
      .replaceAll('³', '3')
      .replaceAll('Σ', 'SUM');
    if (doc.y > 745) doc.addPage();
    doc.fontSize(size).fillColor(color);
    const parts = s.match(/[\u0e00-\u0e7f]+|[^\u0e00-\u0e7f]+/g) || [''];
    parts.forEach((part, i) =>
      doc
        .font(/[\u0e00-\u0e7f]/.test(part) ? 'Thai' : 'Latin')
        .text(part, { continued: i < parts.length - 1, width: 505, lineGap: 4 }),
    );
  };
  const number = (v: unknown) =>
    v === null || v === undefined ? 'N/A' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
  text('ENVIRA / ENVIRONMENTAL INTELLIGENCE', 11, '#087f75');
  doc.moveDown();
  text(report.title, 20);
  text(site.name, 12);
  text(`${dateString(report.period_start)} - ${dateString(report.period_end)} | ${report.snapshot.timezone}`);
  text(
    `Status: ${report.status} | Formula: ${report.snapshot.formulaVersion} | ${site.demo ? 'DEMO' : 'Operational data'}`,
  );
  doc.moveDown();
  text('KPI จากข้อมูลที่อนุมัติ / Approved facts', 14, '#087f75');
  for (const k of report.snapshot.kpis) {
    if (doc.y > 600) doc.addPage();
    doc.moveDown(0.5);
    text(`${k.code} - ${k.name}`, 12);
    text(`${number(k.value)} ${k.unit} | Approved coverage ${number(k.coverage.approvedPercent)}%`);
    text(
      `Intensity ${number(k.intensity)} ${k.unit}/${k.productionUnit || '-'} | Delta ${number(k.delta)} | Change ${number(k.change)}%`,
    );
    text(k.formula, 9, '#62796f');
    text(`Sources: ${k.sources.length} approved versions`, 9);
  }
  doc.moveDown();
  text('ข้อมูลขาดแสดง N/A และยอด partial ต้องอ่านร่วมกับ coverage', 10);
  text('รายงานเป็น snapshot ณ เวลาสร้าง ข้อมูลต้นทางที่แก้ภายหลังไม่เปลี่ยนรายงานรุ่นนี้', 10);
  doc.addPage();
  text('Source lineage / ข้อมูลต้นทาง', 14, '#087f75');
  const base = process.env.APP_URL || 'http://localhost:3000';
  for (const k of report.snapshot.kpis) {
    text(k.code, 11);
    if (!k.sources.length) text('N/A - no approved source', 9);
    for (const source of k.sources) {
      if (doc.y > 737) doc.addPage();
      doc
        .font('Latin')
        .fontSize(8)
        .fillColor('#087f75')
        .text(source, {
          link: `${base}/data/${encodeURIComponent(source)}?site=${encodeURIComponent(site.id)}`,
          underline: true,
          lineGap: 3,
        });
    }
  }
  doc.moveDown();
  text(`Snapshot SHA256: ${report.snapshot.hash}`, 8);
  text(`Report ID: ${report.id}`, 8);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Latin')
      .fontSize(8)
      .fillColor('#62796f')
      .text(`ENVIRA | ${site.demo ? 'DEMO | ' : ''}${i + 1} / ${range.count}`, 42, 765, {
        lineBreak: false,
        width: 505,
        align: 'right',
      });
  }
  doc.end();
  return done;
}
