import { mkdir, writeFile } from 'node:fs/promises';
import { createDatabase, migrate } from '../src/lib/db';
import { seed } from '../src/lib/seed';
import { execute } from '../src/lib/service';
import { id, localDate, one } from '../src/lib/core';
import { reportPdf } from '../src/lib/pdf-report';
const db = await createDatabase(true);
try {
  await migrate(db);
  await seed(db);
  const to = localDate(),
    from = new Date(Date.parse(to) - 7 * 86400000).toISOString().slice(0, 10);
  const report = await execute(
    db,
    'eo',
    'report.create',
    'site-a',
    { title: 'Demo รายงานสิ่งแวดล้อมประจำสัปดาห์', from, to },
    id(),
  );
  await mkdir('output/pdf', { recursive: true });
  await writeFile(
    'output/pdf/demo-acceptance.pdf',
    await reportPdf(report, await one(db, "SELECT * FROM sites WHERE id='site-a'")),
  );
  console.log('Demo PDF: output/pdf/demo-acceptance.pdf');
} finally {
  await db.close();
}
